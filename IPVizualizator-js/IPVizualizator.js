class IPVizualizator {
    
    constructor(args) {
        this.canvas_height = args.height;
        this.canvas_width = args.width;
        this.token = args.token;
        this.canvas = d3.select(args.canvas).append('canvas').classed('mainCanvas', true).attr('width', this.canvas_width).attr('height', this.canvas_height);
        this.canvas_context = this.canvas.node().getContext('2d');
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
        this.actual_pixel = null;
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
        return this.api + "/vizualizator/" + this.token + "/map/" + this.network + "/" + this.mask +"?resolution=" + this.resolution + "&skip_zeros=" + this.skip_zeros;
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
        
        const pixel_width = Math.ceil(this.canvas_width / (2**this.network_data.hilbert_order));
        const pixel_height = Math.ceil(this.canvas_height / (2**this.network_data.hilbert_order));


        var pixels = this.custom.selectAll("custom.rect").data(this.network_data.pixels);

        pixels
            .exit()
            .remove();
        
        var new_pixels = pixels
            .enter()
            .append("custom")
            .attr("class", "rect");
            
        new_pixels
            .attr("width", pixel_width)
            .attr("height", pixel_height)
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
            .attr("x", function(d) {
                return d.x * pixel_width;
            })
            .attr("y", function(d) {
                return d.y * pixel_height;
            });

        pixels
            .attr("width", pixel_width)
            .attr("height", pixel_height)
            .attr("x", function(d) {
                return d.x * pixel_width;
            })
            .attr("y", function(d) {
                return d.y * pixel_height;
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

        if (pixel_width > 20 && this.bordered_pixel) {
            all_pixels.attr("border", "bordered");
        }
        else {
            all_pixels.attr("border", "nobordered");
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
            
            if(pixel.empty() == false && pixel.attr("border") == "bordered") {
                var size = 2**this.network_data.hilbert_order
                context.lineWidth = 2;
                context.strokeStyle = "#C7C7C7";
                for(var x = 0; x < size; x++) {
                    for(var y = 0; y < size; y++) {
                        context.strokeRect(x*pixel.attr('width'), y*pixel.attr('height'), pixel.attr('width'), pixel.attr('height'));
                    }
                }
            }
        }
        
        var pixels = this.custom.selectAll("custom.rect");

        pixels.each(function(d) {
            var pixel = d3.select(this);
            context.fillStyle = hidden ? pixel.attr('fillStyleHidden') : pixel.attr('fillStyle');
            context.fillRect(pixel.attr('x'), pixel.attr('y'), pixel.attr('width'), pixel.attr('height'));
            if(pixel.attr("border") == "bordered" && hidden == false) {
                context.lineWidth = 2;
                context.strokeStyle = "#C7C7C7";
                context.strokeRect(pixel.attr('x'), pixel.attr('y'), pixel.attr('width'), pixel.attr('height'));
            }
        });
        //    if(this.actual_pixel != null && hidden == false) {
        //        var pixel = d3.select(this.actual_pixel);
        //        context.lineWidth = 1;
        //        context.strokeStyle = "#FF0000";
        //        context.strokeRect(pixel.attr('x'), pixel.attr('y'), pixel.attr('width'), pixel.attr('height'));
        //    }
    }

    zoom(d) {
        this.network = d.ip.split("/")[0];
        this.mask = d.ip.split("/")[1];
        this.resolution = this.resolution + 8 <= 32 ? this.resolution + 8: 32;
        
        this.update();

    }
    
    add_listeners() {
        d3.select('.mainCanvas').on('mousemove',  d => {
            var mouseX = d3.event.layerX || d3.event.offsetX;
			var mouseY = d3.event.layerY || d3.event.offsetY;
			var hiddenCtx = this.hidden_canvas_context;

			var col = hiddenCtx.getImageData(mouseX, mouseY, 1, 1).data;
			var colKey = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';

			var pixelData = this.color_to_pixel[colKey];
            //if(pixelData != this.actual_pixel) {
            //    this.actual_pixel = pixelData;
            //    this.draw(false);
            //}
			if (pixelData) {

				d3.select('#tooltip')
					.style('opacity', 0.8)
					.style('top', d3.event.pageY + 5 + 'px')
					.style('left', d3.event.pageX + 5 + 'px')
					.html("<b>Network:</b> " + pixelData.ip + "<br /><b>Value:</b> " + pixelData.val );

			} else {

				d3.select('#tooltip')
					.style('opacity', 0);

			}

		});
        d3.select('.mainCanvas').on('click',  d => {
            var mouseX = d3.event.layerX || d3.event.offsetX;
			var mouseY = d3.event.layerY || d3.event.offsetY;
			var hiddenCtx = this.hidden_canvas_context;

			var col = hiddenCtx.getImageData(mouseX, mouseY, 1, 1).data;
			var colKey = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';

			var pixelData = this.color_to_pixel[colKey];
            this.actual_pixel = null;

			if (pixelData) {
                this.zoom(pixelData);
			}

		});
        d3.select('.mainCanvas').on('mouseout',  d => {
				d3.select('#tooltip')
					.style('opacity', 0);
		
                this.actual_pixel = null;
            });
    }
    
}
