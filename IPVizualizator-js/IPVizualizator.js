class IPVizualizator {
    
    constructor(args) {
        this.canvas_height = args.height;
        this.canvas_width = args.width;
        this.token = args.token;
        this.canvas = d3.select(args.canvas).append('canvas')
                        .classed('mainCanvas', true)
                        .attr('width', this.canvas_width)
                        .attr('height', this.canvas_height)
                        .attr('style', 'position: absolute; left: 0; top: 0; z-index: 0; background-color: transparent;');
        this.canvas_context = this.canvas.node().getContext('2d');
        this.overlay_canvas = d3.select(args.canvas).append('canvas')
            .classed('overlayCanvas', true)
            .attr('width', this.canvas_width)
            .attr('height', this.canvas_height)
            .attr('style', 'position: absolute; left: 0; top: 0; z-index: 1; background-color: transparent;');
        this.overlay_canvas_context = this.overlay_canvas.node().getContext('2d');

        var customBase = document.createElement("custom");
        this.custom = d3.select(customBase);
        this.api = args.api;
        this.network = args.network;
        this.mask = args.mask;
        this.resolution = args.resolution;
        this.skip_zeros = args.skip_zeros;
        this.bordered_pixel = 'bordered_pixel' in args ? args.bordered_pixel : true;

        this.network_data = {};
        this.color_map = d3.scaleSequential().interpolator(d3.interpolateViridis);
        this.hidden_canvas = d3.select(args.canvas).append('canvas').classed('hiddenCanvas', true).attr('style', 'display: none;').attr('width',this.canvas_width).attr('height', this.canvas_height);
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
    
    set_canvas_size(width, height) {
        var context = this.canvas_context;
        var hidden_context = this.hidden_canvas_context;
        context.clearRect(0, 0, this.canvas_width, this.canvas_height);
        hidden_context.clearRect(0, 0, this.canvas_width, this.canvas_height);
        
        this.canvas_width = width;
        this.canvas_height = height;
        this.canvas.attr('width', this.canvas_width).attr('height', this.canvas_height);
        this.hidden_canvas.attr('width', this.canvas_width).attr('height', this.canvas_height);
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
        });
    }

    databind() {
        this.color_map.domain([parseFloat(this.network_data.min_value), parseFloat(this.network_data.max_value)]);
        
        this.pixel_width = Math.floor(this.canvas_width / (2**this.network_data.hilbert_order));
        this.pixel_height = Math.floor(this.canvas_height / (2**this.network_data.hilbert_order));


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
        context.clearRect(0, 0, this.canvas_width, this.canvas_height);
        
        
        if(hidden == false && this.skip_zeros == true) {
            context.fillStyle = "#000000";
            context.fillRect(0, 0, this.canvas_width, this.canvas_height);
            
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
        context.clearRect(0, 0, this.canvas_width, this.canvas_height);
        context.globalAlpha = 1.0 - this.map_opacity;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, this.canvas_width, this.canvas_height);
        context.globalAlpha = this.overlay_opacity;

        if(this.zoomed_subnet != null) {
            var coords = this.hilbert_i_to_xy(this.zoomed_subnet,this.network_data.hilbert_order);
            var coords_next_index = this.hilbert_i_to_xy(this.zoomed_subnet+1,this.network_data.hilbert_order);
            var size = 2**(this.network_data.hilbert_order - this.zoom_mask / 2)
            size = size >= 1 ? size : 1;
            var width = this.pixel_width * size;
            var height = this.pixel_height * size;
            context.lineWidth = this.overlay_thickness;
            context.strokeStyle = "#ff0000";

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

            context.fillStyle = "#ff0000";
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
            if(x+width/2+text_width/2 > this.canvas_width) {
                context.textAlign = "right";
                x = this.canvas_width - 3;

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
    }

    zoom(d) {
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
        d3.select('.overlayCanvas').on('mousemove',  d => {
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
        d3.select('.overlayCanvas').on('click',  () => {
			if (this.zoomed_subnet != null) {
                this.zoom();
			}

		});
        d3.select('.overlayCanvas').on('mouseout',  d => {
				d3.select('#tooltip')
					.style('opacity', 0);
            if(this.zoomed_subnet != null) {
                this.zoomed_subnet = null;
                this.draw_overlay();
            }
            });
    }
    
}
