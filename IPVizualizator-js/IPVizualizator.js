/*
* ipvizualizator.js v0.9
*
* Copyright (c) 2020 Jakub Jancicka <jancijak@fit.cvut.cz>
* Released under Apache license v2.0
* */

class IPVizualizator {

    constructor(args) {
        this.Size = {'small': 512, 'regular': 768, 'large': 1024, 'xlarge': 4096};
        const RequiredParameters = ['api', 'token', 'network', 'mask', 'resolution', 'id'];

        // Check if required parameters are not missing
        for(const parameter of RequiredParameters) {
            if(!(parameter in args)) {
                console.error('IPVizualizator: required "' + parameter + '" key missing in constructor.');
                return;
            }
        }

        // Configuration parameters
        this.api = args.api;
        this.token = args.token;
        this.network = args.network;
        this.mask = args.mask;
        this.resolution = args.resolution;
        this.canvas_size = args.size in this.Size ? this.Size[args.size] : this.Size.regular;
        this.container = d3.select(args.id).classed('card', true).style('width', (this.canvas_size + 2) + 'px');

        var config = 'config' in args && typeof args.config == 'object' ? args.config : {};
        this.static = 'static' in config ? config.static : false;
        this.skip_zeros = 'skip_zeros' in config ? config.skip_zeros : false;
        this.bordered_pixels = 'bordered_pixels' in config ? config.bordered_pixels : true;
        this.zoom_mask = 'zoom_mask' in config ? config.zoom_mask : 8;
        this.map_opacity = 'map_opacity' in config ? config.map_opacity : 1.0;
        this.overlay_opacity = 'overlay_opacity' in config ? config.overlay_opacity : 1.0;
        this.overlay_thickness = 'map_thickness' in config ? config.map_thickness : 1;
        this.overlay_color = 'overlay_color' in config ? config.overlay_color : '#ffff00';
        this.overlay_text_position = 'overlay_text_position' in config ? config.overlay_text_position : 'inside';
        this.show_overlay = 'show_overlay' in config ? config.show_overlay : true;
        this.zoom_opacity = 'zoom_opacity' in config ? config.zoom_opacity : 1.0;
        this.zoom_thickness = 'zoom_thickness' in config ? config.zoom_thickness : 1;
        this.zoom_color = 'zoom_color' in config ? config.zoom_color : '#ff0000';

        // Specified networks which will be highlighted
        this.overlay_subnets = []
        if('overlay_networks' in args) {
            for (const net of args.overlay_networks) {
                var network = this.convert_network_from_string(net.network);
                if(network[0] == false) {
                    console.error('IPVizualizator: Overlay network "' + net.network + '" has wrong format - ' + network[1] + '.');
                }

                var subnet = {'text': net.text, 'ip': network[1], 'mask': network[2]};
                if ('text_position' in net) subnet.text_position = net.text_position;
                if ('color' in net) subnet.color = net.color;

                this.overlay_subnets.push(subnet);
            }
        }

        // Class variables
        this.bordered_map = false;
        this.pixel_width = 0;
        this.pixel_height = 0;
        this.network_history = [];
        this.zoomed_subnet = null;
        this.network_data = {};
        this.next_color = 1;
        this.color_to_pixel = {};

        // Inject html to page
        this.create_ipvizualizator();

        // Load data from server and render maps
        this.update();

        this.add_listeners();

    }

    // ------- Helpers --------

    convert_ip_from_string(ip_string) {
        var ip = ip_string.split('.').reduce(function (ipInt, octet) {
            return (ipInt << 8) + parseInt(octet, 10)
        }, 0) >>> 0;
        return ip;
    }

    convert_network_from_string(network_string) {
        var network = network_string.split('/');

        if(network.length != 2) {
            return [false, 'Required format {network IP}/{mask}'];
        }

        if(network[0].match('^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$') == null) {
            return [false, 'Network is not IPv4 address'];
        }

        if(isNaN(network[1])) {
            return [false, 'Network mask is not integer'];
        }

        var mask = parseInt(network[1]);

        if(mask % 2 == 1 || mask < 0 || mask  > 32) {
            return [false, 'Network mask is odd or invalid'];
        }

        var ip = this.convert_ip_from_string(network[0]);
        var network_portion = ip >>> (32-mask) << (32-mask) >>>0;

        if(ip != network_portion) {
            return [false, 'IP is not valid network address'];
        }

        return [true, ip, mask];
    }

    create_ipvizualizator() {
        if(d3.select('.vizualizator-tooltip').empty() == true) {
            this.tooltip = d3.select(document.body).append('div').classed('vizualizator-tooltip', true);
        }
        else {
            this.tooltip = d3.select('.vizualizator-tooltip');
        }
        this.tooltip.style('position', 'absolute').style('display', 'inline-block').style('padding', '10px').style('font-family', "'Open Sans' sans-serif").style('color', '#000').style('background-color', '#fff').style('border', '1px solid #999').style('border-radius', '2px').style('pointer-events', 'none').style('opacity', '0').style('z-index', '99');
        this.header = this.container.append('div').classed('card-header', true).style('width', this.canvas_size + 'px').style('padding-left', '10px').style('padding-right', '10px');
        this.header_row = this.header.append('div').classed('row', true);

        this.button_back = this.header_row.append('div').classed('col', true).append('div').classed('button-back align-middle border-right',true).style('padding-right', '5px').style('width', '30px');
        this.button_back_svg = this.button_back.append('svg').attr('viewBox', '0 0 8 8').style('height', '100%').style('width', '100%').append('path').attr('d', 'M4.5 0c-1.93 0-3.5 1.57-3.5 3.5v.5h-1l2 2 2-2h-1v-.5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5c0-1.93-1.57-3.5-3.5-3.5z').attr('transform','translate(0 1)');
        this.network_heading = this.header_row.append('div').classed('network-heading col align-middle',true).style('text-align', 'center').style('font-size', '20px');
        this.menu = this.header_row.append('div').classed('col',true).append('div').classed('float-right', true);
        this.button_config = this.menu.append('div').classed('button-config align-middle border-left float-left',true).style('padding-left', '5px').style('padding-right', '5px').style('width', '30px').style('cursor', 'pointer');
        this.button_config_svg = this.button_config.append('svg').attr('viewBox', '0 0 8 8').style('height', '100%').style('width', '100%').append('path').attr('d', 'M3.5 0l-.5 1.19c-.1.03-.19.08-.28.13l-1.19-.5-.72.72.5 1.19c-.05.1-.09.18-.13.28l-1.19.5v1l1.19.5c.04.1.08.18.13.28l-.5 1.19.72.72 1.19-.5c.09.04.18.09.28.13l.5 1.19h1l.5-1.19c.09-.04.19-.08.28-.13l1.19.5.72-.72-.5-1.19c.04-.09.09-.19.13-.28l1.19-.5v-1l-1.19-.5c-.03-.09-.08-.19-.13-.28l.5-1.19-.72-.72-1.19.5c-.09-.04-.19-.09-.28-.13l-.5-1.19h-1zm.5 2.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z');
        this.button_screenshot = this.menu.append('div').classed('button-screenshot align-middle border-left float-left',true).style('padding-left', '5px').style('width', '25px').style('cursor', 'pointer');
        this.button_screenshot_svg = this.button_screenshot.append('svg').attr('viewBox', '0 0 8 8').style('height', '100%').style('width', '100%').append('path').attr('d', 'M4.09 0c-.05 0-.1.04-.13.09l-.94 1.81c-.02.05-.07.09-.13.09h-1.41c-.83 0-1.5.67-1.5 1.5v4.41c0 .05.04.09.09.09h7.81c.05 0 .09-.04.09-.09v-5.81c0-.06-.04-.09-.09-.09h-.81c-.05 0-.1-.04-.13-.09l-.94-1.81c-.03-.05-.07-.09-.13-.09h-1.81zm-2.59 3c.28 0 .5.22.5.5s-.22.5-.5.5-.5-.22-.5-.5.22-.5.5-.5zm3.5 0c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 1c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z');
        this.map = this.container.append('div').classed('canvases', true).attr('style', 'position: relative;')
            .style('width', this.canvas_size+'px')
            .style('height', this.canvas_size+'px');


        this.status_loading = this.map.append('div').classed('spinner-border text-primary',true).attr('role', 'status').style('width', '75px').style('height', '75px').style('position', 'absolute').style('left', (this.canvas_size - 75)/2 +'px').style('top', (this.canvas_size - 75)/2 +'px').style('z-index', '50');
        this.status_loading.style('display', 'none');

        this.status_error = this.map.append('div').classed('h2 text-danger text-center',true).style('width', this.canvas_size + 'px').style('height', '75px').style('position', 'absolute').style('top', (this.canvas_size - 75)/2 +'px').style('z-index', '51').style('text-shadow', '2px 2px 2px #000000').html("Error je tu a je dlouhy");
        this.status_error.style('display', 'none');

        this.modal_network = this.map.append('div').classed('card', true).style('width', '470px').style('height', '100px').style('position', 'absolute').style('left', (this.canvas_size - 470)/2 +'px').style('top', '0px').style('z-index', '2');
        this.modal_network_body = this.modal_network.append('div').classed('card-body', true);
        this.modal_network_form = this.modal_network_body.append('div').classed('form', true).append('div').classed('form-group', true);
        this.modal_network_form.append('label').attr('for', 'network_input').html("Network");
        this.modal_network_form_network = this.modal_network_form.append('input').attr('id', 'network_input').attr('placeholder', '0.0.0.0/0').style('margin-left', '10px').style('padding-left', '5px');

        this.modal_network_button_set = this.modal_network_form.append('button').classed('set btn btn-primary', true).html('Set').style('margin-left', '10px');
        this.modal_network_button_cancel = this.modal_network_form.append('button').classed('cancel btn btn-secondary', true).html('Close').style('margin-left', '10px');
        this.modal_network_error = this.modal_network_body.append('p').classed('text-danger text-center font-weight-bold', true).style('margin-top', '-10px');
        this.modal_network.style('opacity', '0.95');
        this.modal_network.style('display', 'none');


        this.modal_config = this.map.append('div').classed('card', true).style('width', '320px').style('height', '350px').style('position', 'absolute').style('left', (this.canvas_size - 320) +'px').style('top', '0px').style('z-index', '3');
        this.modal_config_body = this.modal_config.append('div').classed('card-body', true);

        this.modal_config_resolution = this.modal_config_body.append('div').classed('row', true);
        this.modal_config_resolution_label = this.modal_config_resolution.append('div').classed('col-6', true).append('label').attr('for', 'resolution_range').html("Resolution");
        this.modal_config_resolution_range = this.modal_config_resolution.append('div').classed('col-3', true).append('div').append('input').attr('type', 'range').classed('custom-range', true).attr('id', 'resolution_range').attr('step', 2);
        this.modal_config_resolution_value = this.modal_config_resolution.append('div').classed('col-3', true).append('span').classed('font-weight-bold text-primary', true);

        this.modal_config_zoom = this.modal_config_body.append('div').classed('row', true);
        this.modal_config_zoom_label = this.modal_config_zoom.append('div').classed('col-6', true).append('label').attr('for', 'zoom_range').html("Zoom");
        this.modal_config_zoom_range = this.modal_config_zoom.append('div').classed('col-3', true).append('div').append('input').attr('type', 'range').classed('custom-range', true).attr('id', 'zoom_range').attr('step', 2);
        this.modal_config_zoom_value = this.modal_config_zoom.append('div').classed('col-3', true).append('span').classed('font-weight-bold text-primary', true);

        this.modal_config_map_opacity = this.modal_config_body.append('div').classed('row mt-4', true);
        this.modal_config_map_opacity_label = this.modal_config_map_opacity.append('div').classed('col-6', true).append('label').attr('for', 'map_opacity').html("Map opacity");
        this.modal_config_map_opacity_range = this.modal_config_map_opacity.append('div').classed('col-3', true).append('div').append('input').attr('type', 'range').classed('custom-range', true).attr('id', 'map_opacity').attr('step', 0.05).attr('min', 0).attr('max', 1);
        this.modal_config_map_opacity_value = this.modal_config_map_opacity.append('div').classed('col-3', true).append('span').classed('font-weight-bold text-primary', true);

        this.modal_config_overlay_show = this.modal_config_body.append('div').classed('row mb-2', true);
        this.modal_config_overlay_show_label = this.modal_config_overlay_show.append('div').classed('col-6 text-nowrap', true).html('Show overlay');
        this.modal_config_overlay_show_switch = this.modal_config_overlay_show.append('div').classed('col-3 custom-control custom-switch', true);
        this.modal_config_overlay_show_checkbox = this.modal_config_overlay_show_switch.append('input').attr('type', 'checkbox').classed('custom-control-input position-static', true).attr('id', 'overlay_show');
        this.modal_config_overlay_show_empty_label = this.modal_config_overlay_show_switch.append('label').classed('custom-control-label', true).attr('for', 'overlay_show').html('');

        this.modal_config_overlay_opacity = this.modal_config_body.append('div').classed('row', true);
        this.modal_config_overlay_opacity_label = this.modal_config_overlay_opacity.append('div').classed('col-6 text-nowrap', true).append('label').attr('for', 'overlay_opacity').html("Overlay opacity");
        this.modal_config_overlay_opacity_range = this.modal_config_overlay_opacity.append('div').classed('col-3', true).append('div').append('input').attr('type', 'range').classed('custom-range', true).attr('id', 'overlay_opacity').attr('step', 0.05).attr('min', 0).attr('max', 1);
        this.modal_config_overlay_opacity_value = this.modal_config_overlay_opacity.append('div').classed('col-3', true).append('span').classed('font-weight-bold text-primary', true);

        this.modal_config_overlay_thickness = this.modal_config_body.append('div').classed('row', true);
        this.modal_config_overlay_thickness_label = this.modal_config_overlay_thickness.append('div').classed('col-6 text-nowrap', true).append('label').attr('for', 'overlay_thickness').html("Overlay thickness");
        this.modal_config_overlay_thickness_range = this.modal_config_overlay_thickness.append('div').classed('col-3', true).append('div').append('input').attr('type', 'range').classed('custom-range', true).attr('id', 'overlay_thickness').attr('step', 1).attr('min', 1).attr('max', 10);
        this.modal_config_overlay_thickness_value = this.modal_config_overlay_thickness.append('div').classed('col-3', true).append('span').classed('font-weight-bold text-primary', true);

        this.modal_config_button_cancel = this.modal_config_body.append('button').classed('cancel btn btn-secondary', true).html('Close').style('margin-left', '105px').style('margin-top', '20px');

        this.modal_config.style('opacity', '0.95');
        this.modal_config.style('display', 'none');

        this.canvas = this.map.append('canvas')
            .classed('mainCanvas', true)
            .attr('width', this.canvas_size)
            .attr('height', this.canvas_size)
            .attr('style', 'position: absolute; left: 0; top: 0; z-index: 0; background-color: transparent;')
            .style('width', this.canvas_size+'px')
            .style('height', this.canvas_size+'px');
        this.canvas_context = this.canvas.node().getContext('2d');
        this.overlay_canvas = this.map.append('canvas')
            .classed('overlayCanvas', true)
            .attr('width', this.canvas_size)
            .attr('height', this.canvas_size)
            .attr('style', 'position: absolute; left: 0; top: 0; z-index: 1; background-color: transparent;')
            .style('width', this.canvas_size+'px')
            .style('height', this.canvas_size+'px');
        this.overlay_canvas_context = this.overlay_canvas.node().getContext('2d');

        var customBase = document.createElement("custom");
        this.custom = d3.select(customBase);

        this.color_map = d3.scaleSequential().interpolator(d3.interpolateViridis);
        this.hidden_canvas = this.map.append('canvas').classed('hiddenCanvas', true).attr('style', 'display: none;').attr('width',this.canvas_size).attr('height', this.canvas_size);
        this.hidden_canvas_context = this.hidden_canvas.node().getContext('2d');



    }

    set_network(network) {
        this.network = network;
    }
    
    set_token(token) {
        this.token = token;
    }
    
    set_mask(mask) {
        this.mask = parseInt(mask);
    }
    
    set_resolution(resolution) {
        this.resolution = parseInt(resolution);
    }
    
    set_network_data(network_data) {
        this.network_data = network_data;
    }
    
    set_skip_zeros(skip_zeros) {
        this.skip_zeros = skip_zeros;
    }
    
    set_canvas_size(size) {
        size = size in this.Size ? this.Size[size] : this.canvas_size;
        if(size == this.canvas_size) return;

        var context = this.canvas_context;
        var hidden_context = this.hidden_canvas_context;
        var overlay_context = this.overlay_canvas_context;
        context.clearRect(0, 0, this.canvas_size, this.canvas_size);
        hidden_context.clearRect(0, 0, this.canvas_size, this.canvas_size);
        overlay_context.clearRect(0, 0, this.canvas_size, this.canvas_size);

        this.canvas_size = size;
        this.canvas.attr('width', this.canvas_size).attr('height', this.canvas_size).style('width', this.canvas_size+'px')
                .style('height', this.canvas_size+'px');
        this.hidden_canvas.attr('width', this.canvas_size).attr('height', this.canvas_size);
        this.overlay_canvas.attr('width', this.canvas_size).attr('height', this.canvas_size).style('width', this.canvas_size+'px')
                .style('height', this.canvas_size+'px');
        this.map.style('width', this.canvas_size+'px').style('height', this.canvas_size+'px');
        this.container.style('width', (this.canvas_size + 2) + 'px');
        this.header.style('width', this.canvas_size + 'px');
        this.modal_network.style('left', (this.canvas_size - 470)/2 +'px');
        this.modal_config.style('left', (this.canvas_size - 320) +'px');
        this.status_loading.style('left', (this.canvas_size - 75) /2 +'px');
        this.status_loading.style('top', (this.canvas_size - 75) /2 +'px');
        this.status_error.style('top', (this.canvas_size - 75) /2 +'px');
        this.status_error.style('width',this.canvas_size +'px');
    }

    get_network_data() {
        return this.network_data;
    }

    create_api_call_url() {
        return this.api + "/vizualizator/" + this.token + "/map/" + this.network + "/" + this.mask +"?resolution=" + (this.mask + this.resolution) + "&skip_zeros=" + this.skip_zeros + "&raw_data=true";
    }

    hilbert_i_to_xy(index, order) {
        var state = 0
        var x = 0
        var y = 0

        for (var it = 2 * order - 2; it > -2; it = it - 2) {
            var row = 4 * state | ((index >> it) & 3)
            x = (x << 1) | ((0x936C >> row) & 1)
            y = (y << 1) | ((0x39C6 >> row) & 1)
            state = (0x3E6B94C1 >> 2 * row) & 3
        }

        return [x, y]
    }

    genColor() {
        var ret = [];
        if(this.next_color < 16777215){
            ret.push(this.next_color & 0xff);
            ret.push((this.next_color & 0xff00) >> 8);
            ret.push((this.next_color & 0xff0000) >> 16);
            this.next_color += 1;
        }
        var col = "rgb(" + ret.join(',') + ")";
        return col;
    }
    update() {
        this.status_error.style('display', 'none');
        this.status_loading.style('display', 'initial');

        const api_call_url = this.create_api_call_url();
        
        $.get(api_call_url, data => {
            this.network_data = data;
            this.databind();
            this.draw(false);
            this.draw(true);
            this.draw_overlay();
            this.draw_menu();
            this.status_loading.style('display', 'none');
            })
            .fail(data => {
                this.status_loading.style('display', 'none');
                if(data.responseJSON != null) {
                    this.status_error.html("Error: " + data.responseJSON.detail);
                    this.status_error.style('display', 'initial');
                }
                else {
                    this.status_error.html("Can't load map");
                    this.status_error.style('display', 'initial');
                }
            }
            );
    }

    databind() {
        this.color_map.domain([parseFloat(this.network_data.min_value), parseFloat(this.network_data.max_value)]);
        
        this.pixel_width = Math.floor(this.canvas_size / (2**this.network_data.hilbert_order));
        this.pixel_height = Math.floor(this.canvas_size / (2**this.network_data.hilbert_order));


        var pixels = this.custom.selectAll("custom.rect").data(this.network_data.pixels);

        pixels
            .exit()
            .remove();
        
        var new_pixels = pixels
            .enter()
            .append("custom")
            .attr("class", "rect");
            
        new_pixels
            .attr("fillStyle", d => {
                var val = parseFloat(d.val)
                return val == 0 ? "#000000" : this.color_map(val);
            })
            .attr("fillStyleHidden", d => { 
                if(!d.hiddenCol) {
                    d.hiddenCol = this.genColor(); 
                    this.color_to_pixel[d.hiddenCol] = d;
                }
                return d.hiddenCol;
            })
            .attr("x", d => {
                return this.hilbert_i_to_xy(d.ip, this.network_data.hilbert_order)[0] * this.pixel_width;
            })
            .attr("y", d => {
                return this.hilbert_i_to_xy(d.ip, this.network_data.hilbert_order)[1] * this.pixel_height;
            });

        pixels
            .attr("x", d => {
                return this.hilbert_i_to_xy(d.ip, this.network_data.hilbert_order)[0] * this.pixel_width;
            })
            .attr("y", d => {
                return this.hilbert_i_to_xy(d.ip, this.network_data.hilbert_order)[1] * this.pixel_height;
            })
            .attr("fillStyle", d => { 
                var val = parseFloat(d.val)
                return val == 0 ? "#000000" : this.color_map(val);
            })
            .attr("fillStyleHidden", d => { 
                if(!d.hiddenCol) {
                    d.hiddenCol = this.genColor(); 
                    this.color_to_pixel[d.hiddenCol] = d;
                }
                return d.hiddenCol;
            })
        
        var all_pixels = this.custom.selectAll("custom.rect");

        if (this.pixel_width > 20 && this.bordered_pixels) {
            this.bordered_map = true;
        }
        else {
            this.bordered_map = false;
       }


    }


    draw(hidden) {
        var context = this.canvas_context;
        if(hidden) {
            context = this.hidden_canvas_context;
        }
        context.clearRect(0, 0, this.canvas_size, this.canvas_size);
        
        
        if(hidden == false && this.skip_zeros == true) {
            context.fillStyle = "#000000";
            context.fillRect(0, 0, this.canvas_size, this.canvas_size);
            
            var pixel = this.custom.select("custom.rect")
            
            if(pixel.empty() == false && this.bordered_map == true) {
                var size = 2**this.network_data.hilbert_order
                context.lineWidth = 1;
                context.strokeStyle = "#C7C7C7";
                for(var x = 0; x < size; x++) {
                    for(var y = 0; y < size; y++) {
                        context.strokeRect(x*this.pixel_width, y*this.pixel_height, this.pixel_width, this.pixel_height);
                    }
                }
            }
        }
        
        var pixels = this.custom.selectAll("custom.rect");

        var that = this
        pixels.each(function(d) {
            var pixel = d3.select(this);
            context.fillStyle = hidden ? pixel.attr('fillStyleHidden') : pixel.attr('fillStyle');
            context.fillRect(pixel.attr('x'), pixel.attr('y'), that.pixel_width, that.pixel_height);
            if(that.bordered_map == true && hidden == false) {
                context.lineWidth = 2;
                context.strokeStyle = "#C7C7C7";
                context.strokeRect(pixel.attr('x'), pixel.attr('y'), that.pixel_width, that.pixel_height);
            }
        });

        this.draw_overlay();
    }

    draw_overlay() {
        var context = this.overlay_canvas_context;
        context.clearRect(0, 0, this.canvas_size, this.canvas_size);
        context.globalAlpha = 1.0 - this.map_opacity;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, this.canvas_size, this.canvas_size);
        context.shadowColor = "#6a6a6a";
        context.shadowBlur = 4;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 1;

        context.globalAlpha = this.overlay_opacity;

        // Overlay subnets
        if(this.show_overlay == true) {
            for (const subnet of this.overlay_subnets) {
                var bit_shift = 32 - this.network_data.prefix_length;
                var bit_mask = 0xFFFFFFFF;
                bit_mask = bit_shift < 32 ? bit_mask << bit_shift >>> 0 : 0x0;
                var ip_network = (subnet.ip & bit_mask) >>> 0;
                if (this.network_data.network == ip_network) {
                    var ip = (subnet.ip >> 32 - this.network_data.pixel_mask) << 32 - this.network_data.pixel_mask >>> 0;
                    var index = (ip - this.network_data.network) >>> 32 - this.network_data.pixel_mask;
                    var coords = this.hilbert_i_to_xy(index, this.network_data.hilbert_order);
                    var coords_next_index = this.hilbert_i_to_xy(index + 1, this.network_data.hilbert_order);
                    var size = 2 ** (this.network_data.hilbert_order - (subnet.mask - this.network_data.prefix_length) / 2)
                    size = size >= 1 ? size : 1;
                    var width = this.pixel_width * size;
                    var height = this.pixel_height * size;

                    if(width > this.canvas_size) continue;

                    context.lineWidth = this.overlay_thickness;
                    context.strokeStyle = "color" in subnet ? subnet.color : this.overlay_color;

                    var x = 0;
                    var y = 0;
                    if (coords[0] <= coords_next_index[0] && coords[1] <= coords_next_index[1]) {
                        x = coords[0] * this.pixel_width;
                        y = coords[1] * this.pixel_height;
                    } else {
                        x = (coords[0] * this.pixel_width + this.pixel_width) - width;
                        y = (coords[1] * this.pixel_height + this.pixel_height) - height;
                    }
                    context.strokeRect(x, y, width, height);

                    if("text" in subnet) {
                        var position = "text_position" in subnet ? subnet.text_position : this.overlay_text_position;
                        context.fillStyle = "color" in subnet ? subnet.color : this.overlay_color;
                        var font_size = Math.floor(width * 0.15);

                        if(position == "inside") {
                            context.font = "bold " + font_size + "px Arial";
                            x = x + width / 2;
                            context.textAlign = "center";
                            context.textBaseline = "middle";
                            y = y + height / 2;
                        }
                        else {
                            context.font = "bold 20px Arial";
                            font_size = 20;
                            var text_width = context.measureText(subnet.text).width;

                            if (y < 25) {
                                context.textBaseline = "top";
                                y = y + height + 2;
                            } else {
                                context.textBaseline = "bottom";
                            }
                            if (x + width / 2 + text_width / 2 > this.canvas_size) {
                                context.textAlign = "right";
                                x = this.canvas_size - 3;

                            } else if (x + width / 2 - text_width / 2 < 0) {
                                context.textAlign = "left";
                                x = 3;
                            } else {
                                x = x + width / 2;
                                context.textAlign = "center";
                            }
                        }
                        var lines = subnet.text.split('\n');
                        for(const line of lines) {
                            context.fillText(line, x, y);
                            y += font_size;
                        }
                    }

                }

            }
        }

        context.globalAlpha = this.zoom_opacity;

        if(this.zoomed_subnet != null && this.static == false) {
            var coords = this.hilbert_i_to_xy(this.zoomed_subnet,this.network_data.hilbert_order);
            var coords_next_index = this.hilbert_i_to_xy(this.zoomed_subnet+1,this.network_data.hilbert_order);
            var size = 2**(this.network_data.hilbert_order - this.zoom_mask / 2)
            size = size >= 1 ? size : 1;
            var width = this.pixel_width * size;
            var height = this.pixel_height * size;

            context.lineWidth = this.zoom_thickness;
            context.strokeStyle = this.zoom_color;

            var x = 0;
            var y = 0;
            if(coords[0] <= coords_next_index[0] && coords[1] <= coords_next_index[1]) {
                x = coords[0] * this.pixel_width;
                y = coords[1] * this.pixel_height;
            }
            else {
                x = (coords[0] * this.pixel_width + this.pixel_width) - width;
                y = (coords[1]  * this.pixel_height + this.pixel_height) - height;
            }
            context.strokeRect(x, y, width, height);

            context.fillStyle = this.zoom_color;
            context.font = "bold 20px Arial";
            var ip = this.network_data.network + (this.zoomed_subnet << (32 - this.network_data.pixel_mask));
            ip =  ( (ip>>>24) +'.' + (ip>>16 & 255) +'.' + (ip>>8 & 255) +'.' + (ip & 255) );
            var mask = this.network_data.prefix_length + this.zoom_mask;
            mask = mask <= 32 ? mask : 32;
            var subnet_text = ip + "/" + mask;
            var text_width = context.measureText(subnet_text).width;

            if(y < 25) {
                context.textBaseline = "top";
                y = y + height + 2;
            }
            else {
                context.textBaseline = "bottom";
            }
            if(x+width/2+text_width/2 > this.canvas_size) {
                context.textAlign = "right";
                x = this.canvas_size - 3;

            }
            else if(x+width/2-text_width/2 < 0) {
                context.textAlign = "left";
                x = 3;
            }
            else {
                x = x + width/2;
                context.textAlign = "center";
            }
            context.fillText( subnet_text, x, y);
        }

        context.globalAlpha = 1.0;
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
    }

    draw_menu() {
        this.network_heading.html("<b>" + this.network + "/" + this.mask + "</b>");
    }

    zoom(d) {
        this.network_history.push([this.network, this.mask, this.resolution]);
        var ip = this.network_data.network + (this.zoomed_subnet << (32 - this.network_data.pixel_mask));
        ip =  ( (ip>>>24) +'.' + (ip>>16 & 255) +'.' + (ip>>8 & 255) +'.' + (ip & 255) );
        this.network = ip;
        var new_mask = this.network_data.prefix_length + this.zoom_mask;
        this.mask = new_mask <= 32 ? new_mask : 32;
        this.zoomed_subnet = null;
        if(this.resolution + this.mask > 32) {
            this.resolution = 32 - this.mask;
        }
        if(this.zoom_mask > this.resolution) {
            this.zoom_mask = this.resolution ;
        }
        this.update();

    }

    take_screenshot() {
        var screenshot_canvas = d3.select(document.createElement('canvas'));
        var screenshot_context = screenshot_canvas.node().getContext('2d');
        screenshot_canvas.attr('width', this.canvas_size).attr('height', this.canvas_size);
        screenshot_context.drawImage(this.canvas.node(), 0, 0, this.canvas_size, this.canvas_size);
        screenshot_context.drawImage(this.overlay_canvas.node(), 0, 0, this.canvas_size, this.canvas_size);
        var image = screenshot_canvas.node().toDataURL('image/png');
        var that = this;
        fetch(image).then(function(t) {
            return t.blob().then((b)=>{
                var a = document.createElement('a');
                a.href = URL.createObjectURL(b);
                a.setAttribute('download', 'map_' + that.network.replace(/\./g, '-') +'_'+ that.mask +'.png');
                a.click();
            });
        });
    }
    
    add_listeners() {
        this.overlay_canvas.on('mousemove',  d => {
            var mouseX = d3.event.layerX || d3.event.offsetX;
			var mouseY = d3.event.layerY || d3.event.offsetY;
			var hiddenCtx = this.hidden_canvas_context;

			var col = hiddenCtx.getImageData(mouseX, mouseY, 1, 1).data;
			var colKey = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';

			var pixelData = this.color_to_pixel[colKey];
			if (pixelData) {
			    var ip = this.network_data.network + (pixelData.ip << (32 - this.network_data.pixel_mask)) >>> 0;
                var ip_string =  ( (ip>>>24) +'.' + (ip>>16 & 255) +'.' + (ip>>8 & 255) +'.' + (ip & 255) );
                var subnet_shift = this.network_data.pixel_mask - this.network_data.prefix_length - this.zoom_mask
                var subnet = pixelData.ip >>  subnet_shift << subnet_shift
                if(this.zoomed_subnet != subnet) {
                    this.zoomed_subnet = subnet;
                    this.draw_overlay();
                }

                this.tooltip
					.style('opacity', 0.8)
					.style('top', d3.event.pageY + 5 + 'px')
					.style('left', d3.event.pageX + 5 + 'px')
					.html("<b>Network:</b> " + ip_string + "/" + this.network_data.pixel_mask + "<br /><b>Value:</b> " + pixelData.val );
			} else {
                if(this.zoomed_subnet != null) {
                    this.zoomed_subnet = null;
                    this.draw_overlay();
                }

				this.tooltip
					.style('opacity', 0);

			}

		});
        this.overlay_canvas.on('click',  () => {
			if (this.zoomed_subnet != null && this.static == false) {
                this.modal_network.style('display', 'none');
                this.modal_config.style('display', 'none');
                this.zoom();
			}

		});
        this.overlay_canvas.on('mouseout',  d => {
            this.tooltip
					.style('opacity', 0);
            if(this.zoomed_subnet != null) {
                this.zoomed_subnet = null;
                this.draw_overlay();
            }
            });
        this.button_back.on('mouseout',  d => {
            this.button_back_svg.attr('fill', 'black');
            this.tooltip.style('opacity', 0);
            this.button_back.style('cursor', 'default');
        });
        this.button_back.on('mousemove',  d => {
            if(this.network_history.length != 0) {
                var last_network = this.network_history[this.network_history.length -1];
                this.button_back_svg.attr('fill', '#0275d8');
                this.button_back.style('cursor', 'pointer');
                this.tooltip
                    .style('opacity', 0.8)
                    .style('top', d3.event.pageY + 5 + 'px')
                    .style('left', d3.event.pageX + 5 + 'px')
                    .html("Return back to network <b>" + last_network[0] + "/" + last_network[1] + "</b>");
            }
            else {
                this.tooltip
                    .style('opacity', 0.8)
                    .style('top', d3.event.pageY + 5 + 'px')
                    .style('left', d3.event.pageX + 5 + 'px')
                    .html("No history - can't go back");
            }
        });
        this.button_back.on('click',  d => {
            if(this.network_history != 0) {
                this.modal_network.style('display', 'none');
                this.modal_config.style('display', 'none');
                var last_network = this.network_history[this.network_history.length -1];
                this.network_history.pop();
                this.button_back_svg.attr('fill', '#04407f');
                this.network = last_network[0];
                this.mask = last_network[1];
                this.resolution = last_network[2];
                this.zoomed_subnet = null;
                this.update();
            }
        });
        this.network_heading.on('mouseout',  d => {
            this.network_heading.style('color', 'black');
            this.tooltip.style('opacity', 0);
        });
        this.network_heading.on('mousemove',  d => {
            if(this.static == false) {
                this.network_heading.style('color', '#0275d8').style('cursor', 'pointer');

                this.tooltip
                    .style('opacity', 0.8)
                    .style('top', d3.event.pageY + 5 + 'px')
                    .style('left', d3.event.pageX + 5 + 'px')
                    .html("Change displayed network");
            }
        });
        this.network_heading.on('click',  d => {
            if(this.modal_network.style('display') == 'none' && this.static == false) {
                this.modal_network_form_network.attr('placeholder', this.network + "/" + this.mask);
                this.modal_network.style('display', 'initial');
                this.modal_config.style('display', 'none');
            }
            else {
                this.modal_network.style('display', 'none');
            }
        });
        this.modal_network_button_cancel.on('click',  d => {
            this.modal_network.style('display', 'none');
        });
        this.modal_network_button_set.on('click',  d => {
            this.modal_network_error.html('');
            var network_string = this.modal_network_form_network.node().value;
            var network = this.convert_network_from_string(network_string);

            if(network[0] == false) {
                this.modal_network_error.html(network[1]);
                return;
            }

            this.network_history.push([this.network, this.mask, this.resolution]);
            this.network = network_string.split('/')[0];
            this.mask = network[2];
            this.zoomed_subnet = null;

            this.modal_network_error.html('');
            this.modal_network_form_network.property('value', '');
            this.modal_network.style('display', 'none');

            this.update();
        });
        this.button_config.on('mouseout',  d => {
            this.button_config_svg.attr('fill', 'black');
            this.tooltip.style('opacity', 0);
        });
        this.button_config.on('mousemove',  d => {
            this.button_config_svg.attr('fill', '#0275d8');
            this.tooltip
                .style('opacity', 0.8)
                .style('top', d3.event.pageY + 5 + 'px')
                .style('left', d3.event.pageX + 5 + 'px')
                .html("Configure map");
        });

        this.button_config.on('click',  d => {
            if(this.modal_config.style('display') == 'none') {

                this.modal_config_resolution_range.property('value', this.resolution);
                this.modal_config_zoom_range.property('value', this.zoom_mask);
                this.modal_config_resolution_value.html('+ /'+ this.resolution);
                this.modal_config_zoom_value.html('+ /'+ this.zoom_mask);
                this.modal_config_zoom_range.property('min', 2);
                this.modal_config_zoom_range.property('max', this.resolution);
                this.modal_config_resolution_range.property('min', 0);
                this.modal_config_resolution_range.property('max', this.mask + 16 <= 32 ? 16 : 32 - this.mask );
                this.modal_config_map_opacity_range.property('value', this.map_opacity);
                this.modal_config_map_opacity_value.html(this.map_opacity);
                this.modal_config_overlay_opacity_range.property('value', this.overlay_opacity);
                this.modal_config_overlay_opacity_value.html(this.overlay_opacity);
                this.modal_config_overlay_thickness_range.property('value', this.overlay_thickness);
                this.modal_config_overlay_thickness_value.html(this.overlay_thickness);
                this.modal_config_overlay_show_checkbox.property('checked', this.show_overlay);

                if(this.show_overlay == true) {
                    this.modal_config_overlay_opacity_range.attr('disabled', null);
                    this.modal_config_overlay_thickness_range.attr('disabled', null);
                }
                else {
                    this.modal_config_overlay_opacity_range.attr('disabled', true);
                    this.modal_config_overlay_thickness_range.attr('disabled', true);
                }


                this.modal_config.style('display', 'initial');
                this.modal_network.style('display', 'none');
            }
            else {
                this.modal_config.style('display', 'none');
            }
        });
        this.modal_config_zoom_range.on('input',  d => {
            this.modal_config_zoom_value.html('+ /'+ this.modal_config_zoom_range.node().value);
        });
        this.modal_config_zoom_range.on('change',  d => {
            this.zoom_mask = parseInt(this.modal_config_zoom_range.node().value);
        });
        this.modal_config_resolution_range.on('input',  d => {
            this.modal_config_resolution_value.html('+ /'+ this.modal_config_resolution_range.node().value);
        });
        this.modal_config_resolution_range.on('change',  d => {
            this.resolution = parseInt(this.modal_config_resolution_range.node().value);
            this.modal_config_zoom_range.property('min', this.resolution == 0 ? 0 : 2);
            this.modal_config_zoom_range.property('max', this.resolution);
            this.modal_config_zoom_value.html('+ /'+ this.modal_config_zoom_range.node().value);
            this.zoom_mask = parseInt(this.modal_config_zoom_range.node().value);
            this.update();
        });
        this.modal_config_button_cancel.on('click',  d => {
            this.modal_config.style('display', 'none');
        });
        this.modal_config_map_opacity_range.on('input',  d => {
            this.modal_config_map_opacity_value.html(this.modal_config_map_opacity_range.node().value);
        });
        this.modal_config_map_opacity_range.on('change',  d => {
            this.map_opacity = parseFloat(this.modal_config_map_opacity_range.node().value);
            this.draw_overlay();
        });
        this.modal_config_overlay_opacity_range.on('input',  d => {
            this.modal_config_overlay_opacity_value.html(this.modal_config_overlay_opacity_range.node().value);
        });
        this.modal_config_overlay_opacity_range.on('change',  d => {
            this.overlay_opacity = parseFloat(this.modal_config_overlay_opacity_range.node().value);
            this.draw_overlay();
        });
        this.modal_config_overlay_thickness_range.on('input',  d => {
            this.modal_config_overlay_thickness_value.html(this.modal_config_overlay_thickness_range.node().value);
        });
        this.modal_config_overlay_thickness_range.on('change',  d => {
            this.overlay_thickness = parseFloat(this.modal_config_overlay_thickness_range.node().value);
            this.draw_overlay();
        });
        this.modal_config_overlay_show_checkbox.on('change',  d => {
            this.show_overlay = this.modal_config_overlay_show_checkbox.node().checked;
            if(this.show_overlay == true) {
                this.modal_config_overlay_opacity_range.attr('disabled', null);
                this.modal_config_overlay_thickness_range.attr('disabled', null);
            }
            else {
                this.modal_config_overlay_opacity_range.attr('disabled', true);
                this.modal_config_overlay_thickness_range.attr('disabled', true);
            }
            this.draw_overlay();
        });
        this.button_screenshot.on('mouseout',  d => {
            this.button_screenshot_svg.attr('fill', 'black');
            this.tooltip.style('opacity', 0);
        });
        this.button_screenshot.on('mousemove',  d => {
            this.button_screenshot_svg.attr('fill', '#0275d8');
            this.tooltip
                .style('opacity', 0.8)
                .style('top', d3.event.pageY + 5 + 'px')
                .style('left', d3.event.pageX + 5 + 'px')
                .html("Take screenshot of map");
        });

        this.button_screenshot.on('click',  d => {
            this.take_screenshot();
        });
        this.button_screenshot.on('mousemove',  d => {
            this.tooltip
                .style('opacity', 0.8)
                .style('top', d3.event.pageY + 5 + 'px')
                .style('left', d3.event.pageX + 5 + 'px')
                .html("Take screenshot of map");
        });
    }
    
}
