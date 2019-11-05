
class IPVizualizator {
    
    constructor(args) {
        this.canvas = d3.select(args.canvas);
        this.api = args.api;
        this.network = args.network;
        this.mask = args.mask;
        this.resolution = args.resolution;
        this.test_mode = args.test_mode;

        this.network_data = {};
        this.color_map = d3.scaleSequential().interpolator(d3.interpolateViridis);
        this.update();
    }

    info() {
        console.log("API server: " + this.api + ", Network: " + this.network + "/" + this.mask + ", One pixel is mask " + this.resolution);
    }

    set_network(network) {
        this.network = network;
    }
    
    set_mask(mask) {
        this.mask = parseInt(mask);
    }
    
    set_resolution(resolution) {
        this.resolution = parseInt(resolution);
    }
    
    set_test_mode(test) {
        this.test_mode = test;
    }
    
    set_network_data(network_data) {
        this.network_data = network_data;
    }

    get_network_data() {
        return this.network_data;
    }

    create_api_call_url() {
        return this.api + "/network/" + this.network + "/" + this.mask +"?resolution=" + this.resolution + "&test=" + this.test_mode;
    }

    update() {
        const api_call_url = this.create_api_call_url();
        
        $.get(api_call_url, data => {
            this.network_data = data;
            this.render();
        });
    }

    render() {
        this.color_map.domain([parseFloat(this.network_data.Min_value), parseFloat(this.network_data.Max_value)]);
        
        const canvas_width = this.canvas.style("width").slice(0, -2);
        const canvas_height = this.canvas.style("height").slice(0, -2);
        const pixel_width = Math.ceil(canvas_width / Math.sqrt(this.network_data.Pixels.length));
        const pixel_height = Math.ceil(canvas_height / Math.sqrt(this.network_data.Pixels.length));

        var pixels = this.canvas.selectAll("rect").data(this.network_data.Pixels);

        pixels
            .exit()
            .remove();
        
        var new_pixels = pixels
            .enter()
            .append("rect");
            
        new_pixels
            .attr("width", pixel_width)
            .attr("height", pixel_height)
            .style("fill", "#000000")
            .attr("x", function(d) {
                return d.x * pixel_width;
            })
            .attr("y", function(d) {
                return d.y * pixel_height;
            })
            .on("mouseover", function() { d3.select(this).style("stroke", "#ff0000").style("stroke-width", 3); })
            .on("mouseout", function() { d3.select(this).style("stroke", null).style("stroke-width", null); })
            .on("click", d => {
                this.zoom(d);
            })
            .append("title")
            .text(function(d) { 
                return "Network: " + d.Network + " Value: " + d.Val ; 
            });

        new_pixels    
            .transition()
            .duration(1000)
            .style("fill", d => { 
                var val = parseFloat(d.Val)
                return val == 0 ? "#000000" : this.color_map(val);
            });

        pixels
            .attr("width", pixel_width)
            .attr("height", pixel_height)
            .style("fill", "#000000")
            .attr("x", function(d) {
                return d.x * pixel_width;
            })
            .attr("y", function(d) {
                return d.y * pixel_height;
            })
            .style("fill", d => { 
                var val = parseFloat(d.Val)
                return val == 0 ? "#000000" : this.color_map(val);
            })
            .select("title")
            .text(function(d) { 
                return "Network: " + d.Network + " Value: " + d.Val ; 
            });
        
        var all_pixels = this.canvas.selectAll("rect");

        if (pixel_width > 10) {
            all_pixels.attr("class", "bordered");
        }
        else {
            all_pixels.attr("class", "nobordered");
        }


    }

    zoom(d) {
        this.network = d.Network.split("/")[0];
        this.mask = d.Network.split("/")[1];
        this.resolution = this.resolution + 8 <= 32 ? this.resolution + 8: 32;
        
        this.update();

    }

    
}
