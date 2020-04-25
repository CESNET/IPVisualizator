class IPVizualizator {

    constructor(args) {
        this.Size = {"small": 512, "regular": 768, "large": 1024, "xlarge": 4096};
        this.canvas_size = args.size in this.Size ? this.Size[args.size] : this.Size.regular;
        this.token = args.token;

        this.container = d3.select(args.id).classed('card', true).style('width', (this.canvas_size + 2) + 'px');
        this.header = this.container.append('div').classed('card-header', true).style('width', this.canvas_size + 'px').style('padding-left', '10px').style('padding-right', '10px');
        this.header_row = this.header.append('div').classed('row', true);

        this.button_back = this.header_row.append('div').classed('col-sm', true).append('div').classed('button-back align-middle border-right',true).style('padding-right', '5px').style('width', '30px');
        this.button_back_svg = this.button_back.append('svg').attr('viewBox', '0 0 8 8').style('height', '100%').style('width', '100%').append('path').attr('d', 'M4.5 0c-1.93 0-3.5 1.57-3.5 3.5v.5h-1l2 2 2-2h-1v-.5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5c0-1.93-1.57-3.5-3.5-3.5z').attr('transform','translate(0 1)');
        this.network_heading = this.header_row.append('div').classed('network-heading col-sm align-middle',true).style('text-align', 'center').style('font-size', '20px').style('cursor', 'pointer');
        this.menu = this.header_row.append('div').classed('col-sm',true);
        this.map = this.container.append('div').classed('canvases', true).attr('style', 'position: relative;')
                .style('width', this.canvas_size+'px')
                .style('height', this.canvas_size+'px');


        this.modal_network = this.map.append('div').classed('card', true).style('width', '470px').style('height', '130px').style('position', 'absolute').style('left', (this.canvas_size - 470)/2 +'px').style('top', '20px').style('z-index', '2');
        this.modal_network_header = this.modal_network.append('h5').classed('card-header', true).html('Network');
        this.modal_network_body = this.modal_network.append('div').classed('card-body', true);
        this.modal_network_form = this.modal_network_body.append('div').classed('form', true).append('div').classed('form-group', true);
        this.modal_network_form.append('label').attr('for', 'network_input').html("Network");
        this.modal_network_form_network = this.modal_network_form.append('input').attr('id', 'network_input').attr('placeholder', '0.0.0.0/0').style('margin-left', '10px');

        this.modal_network_button_set = this.modal_network_form.append('button').classed('set btn btn-warning', true).html('Set').style('margin-left', '10px');
        this.modal_network_button_cancel = this.modal_network_form.append('button').classed('cancel btn btn-secondary', true).html('Cancel').style('margin-left', '10px');
        this.modal_network.style('display', 'none');

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

        this.static = false;
        var customBase = document.createElement("custom");
        this.custom = d3.select(customBase);
        this.api = args.api;
        this.network = args.network;
        this.mask = args.mask;
        this.resolution = args.resolution;
        this.skip_zeros = "skip_zeros" in args ? args.skip_zeros : false;
        this.bordered_pixel = 'bordered_pixel' in args ? args.bordered_pixel : true;

        this.network_data = {};
        this.color_map = d3.scaleSequential().interpolator(d3.interpolateViridis);
        this.hidden_canvas = this.map.append('canvas').classed('hiddenCanvas', true).attr('style', 'display: none;').attr('width',this.canvas_size).attr('height', this.canvas_size);
        this.hidden_canvas_context = this.hidden_canvas.node().getContext('2d');
        this.nextCol = 1;
        this.color_to_pixel = {};
        this.zoomed_subnet = null;
        this.zoom_mask = 2;
        this.bordered_map = false;
        this.pixel_width = 0;
        this.pixel_height = 0;
        this.map_opacity = 1.0;
        this.overlay_opacity = 1.0;
        this.overlay_thickness = 1;


        this.overlay_subnets = []
        if("overlay_networks" in args) {
            for (const net of args.overlay_networks) {
                var ip = net.network.split("/")[0];
                var mask = parseInt(net.network.split("/")[1]);
                ip = ip.split('.').reduce(function (ipInt, octet) {
                    return (ipInt << 8) + parseInt(octet, 10)
                }, 0) >>> 0;
                var subnet = {"text": net.text, "ip": ip, "mask": mask};
                if ("text_position" in net) subnet.text_position = net.text_position;
                if ("color" in net) subnet.color = net.color;
                this.overlay_subnets.push(subnet);
            }
        }

        this.overlay_color = "#ffff00";
        this.overlay_text_position = "in";
        this.overlay_show = true;
        this.zoom_opacity = 1.0;
        this.zoom_thickness = 1;
        this.zoom_color = "#ff0000";

        this.network_history = [];

        this.update();
        this.add_listeners();

    }

    info() {
        console.log("API server: " + this.api + ", Network: " + this.network + "/" + this.mask + ", One pixel is mask " + this.resolution);
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
    }

    get_network_data() {
        return this.network_data;
    }

    create_api_call_url() {
        return this.api + "/vizualizator/" + this.token + "/map/" + this.network + "/" + this.mask +"?resolution=" + this.resolution + "&skip_zeros=" + this.skip_zeros + "&raw_data=true";
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
        if(this.nextCol < 16777215){
            ret.push(this.nextCol & 0xff);
            ret.push((this.nextCol & 0xff00) >> 8);
            ret.push((this.nextCol & 0xff0000) >> 16); 
            this.nextCol += 1;
        }
        var col = "rgb(" + ret.join(',') + ")";
        return col;
    }
    update() {
        const api_call_url = this.create_api_call_url();
        
        $.get(api_call_url, data => {
            this.network_data = data;
            this.databind();
            this.draw(false);
            this.draw(true);
            this.draw_overlay();
            this.draw_menu();
        });
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

        if (this.pixel_width > 20 && this.bordered_pixel) {
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
        if(this.overlay_show == true) {
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

                        if(position == "in") {
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
        var new_resolution = this.network_data.prefix_length + this.zoom_mask + 8 ;
        this.resolution =  new_resolution <= 32 ? new_resolution : 32;
        this.zoomed_subnet = null;
        if(this.zoom_mask > (this.resolution - this.mask)) {
            this.zoom_mask = this.resolution - this.mask;
        }
        this.update();

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

                d3.select('#tooltip')
					.style('opacity', 0.8)
					.style('top', d3.event.pageY + 5 + 'px')
					.style('left', d3.event.pageX + 5 + 'px')
					.html("<b>Network:</b> " + ip_string + "/" + this.network_data.pixel_mask + "<br /><b>Value:</b> " + pixelData.val );
			} else {
                if(this.zoomed_subnet != null) {
                    this.zoomed_subnet = null;
                    this.draw_overlay();
                }

				d3.select('#tooltip')
					.style('opacity', 0);

			}

		});
        this.overlay_canvas.on('click',  () => {
			if (this.zoomed_subnet != null && this.static == false) {
                this.zoom();
			}

		});
        this.overlay_canvas.on('mouseout',  d => {
				d3.select('#tooltip')
					.style('opacity', 0);
            if(this.zoomed_subnet != null) {
                this.zoomed_subnet = null;
                this.draw_overlay();
            }
            });
        this.button_back.on('mouseout',  d => {
            this.button_back_svg.attr('fill', 'black');
            d3.select('#tooltip').style('opacity', 0);
            this.button_back.style('cursor', 'default');
        });
        this.button_back.on('mousemove',  d => {
            if(this.network_history.length != 0) {
                var last_network = this.network_history[this.network_history.length -1];
                this.button_back_svg.attr('fill', '#ff9600');
                this.button_back.style('cursor', 'pointer');
                d3.select('#tooltip')
                    .style('opacity', 0.8)
                    .style('top', d3.event.pageY + 5 + 'px')
                    .style('left', d3.event.pageX + 5 + 'px')
                    .html("Return back to network <b>" + last_network[0] + "/" + last_network[1] + "</b>");
            }
            else {
                d3.select('#tooltip')
                    .style('opacity', 0.8)
                    .style('top', d3.event.pageY + 5 + 'px')
                    .style('left', d3.event.pageX + 5 + 'px')
                    .html("No history - can't go back");
            }
        });
        this.button_back.on('click',  d => {
            if(this.network_history != 0) {
                var last_network = this.network_history[this.network_history.length -1];
                this.network_history.pop();
                this.button_back_svg.attr('fill', '#aa6802');
                this.network = last_network[0];
                this.mask = last_network[1];
                this.resolution = last_network[2];
                this.zoomed_subnet = null;
                this.update();
            }
        });
        this.network_heading.on('mouseout',  d => {
            this.network_heading.style('color', 'black');
            d3.select('#tooltip').style('opacity', 0);
        });
        this.network_heading.on('mousemove',  d => {
            this.network_heading.style('color', '#ff9600');
            d3.select('#tooltip')
                .style('opacity', 0.8)
                .style('top', d3.event.pageY + 5 + 'px')
                .style('left', d3.event.pageX + 5 + 'px')
                .html("Change displayed network");
        });
        this.network_heading.on('click',  d => {
            this.modal_network_form_network.attr('placeholder', this.network + "/" + this.mask);
            this.modal_network.style('display', 'initial');
        });
        this.modal_network_button_cancel.on('click',  d => {
            this.modal_network.style('display', 'none');
        });
    }
    
}
