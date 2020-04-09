#!/usr/bin/python3
"""
IPVizualizator Backend
"""

import sys
import connexion
import random
import math
from ipaddress import IPv4Address, IPv4Network, AddressValueError
from flask_cors import CORS
from flask import g

from .IPRecords import IPRecords


class IPVizualizator:
    def __init__(self):
        self.ip_records = IPRecords()

    def hilbert_i_to_xy(self, ix, order):
        state = 0
        x = 0
        y = 0
        
        for it in range(2*order-2, -2, -2):
            row = 4*state | ((ix >> it) & 3)
            x = (x << 1) | ((0x936C >> row) & 1)
            y = (y << 1) | ((0x39C6 >> row) & 1)
            state = (0x3E6B94C1 >> 2 * row) & 3
    
        return (x,y)

    def set_ip_record(self, ip, value):
        return self.ip_records.set(ip, value)

    def del_ip_record(self, ip):
        return self.ip_records.delete(ip)

    def add_ip_record(self, ip, value):
        return self.ip_records.add(ip, value)

    def subtract_ip_record(self, ip, value):
        return self.ip_records.subtract(ip, value)

    def get_ip_record(self, ip):
        return self.ip_records.get(ip)

    def get_network_record(self, network):
        return self.ip_records.get_network(network) 

    def get_networks_record(self, network, resolution):
        return self.ip_records.get_networks(network, resolution)

    def count_IPs(self):
        return self.ip_records.size()

IP_vizualizator = IPVizualizator()

#################################
# API
def ip_get_api(ip):
    try:
        ip = IPv4Address(ip)
    except ValueError:
        return {"Status": "error", "Reason": "IP address is invalid"}, 400
    
    value = IP_vizualizator.get_ip_record(ip)
    
    return {"Status": "ok", "Value": value}, 200

def ip_set_api(ip, value):
    try:
        ip = IPv4Address(ip)
    except ValueError:
        return {"Status": "error", "Reason": "IP address is invalid"}, 400
    
    try:
        value = float(value)
    except ValueError:
        return {"Status": "error", "Reason": "Value is not float"}, 400

    IP_vizualizator.set_ip_record(ip, value)
    
    return {"Status": "ok"}, 200

def ip_add_api(ip, value):
    try:
        ip = IPv4Address(ip)
    except ValueError:
        return {"Status": "error", "Reason": "IP address is invalid"}, 400
    
    try:
        value = float(value)
    except ValueError:
        return {"Status": "error", "Reason": "Value is not float"}, 400

    IP_vizualizator.add_ip_record(ip, value)
    
    return {"Status": "ok"}, 200

def ip_subtract_api(ip, value):
    try:
        ip = IPv4Address(ip)
    except ValueError:
        return {"Status": "error", "Reason": "IP address is invalid"}, 400
    
    try:
        value = float(value)
    except ValueError:
        return {"Status": "error", "Reason": "Value is not float"}, 400

    IP_vizualizator.subtract_ip_record(ip, value)
    
    return {"Status": "ok"}, 200

def ip_delete_api(ip):
    try:
        ip = IPv4Address(ip)
    except ValueError:
        return {"Status": "error", "Reason": "IP address is invalid"}, 400

    IP_vizualizator.del_ip_record(ip)
    
    return {"Status": "ok"}, 200

def ip_parse_api(file):
    try:
        with open(file) as f: 
            IP_vizualizator.parse_input_file(f, ' ') 
    except EnvironmentError:
        return {"Status": "error", "Reason": "File is invalid"}, 400
    
    return {"Status": "ok"}, 200

def ip_api():
    return {"Size": IP_vizualizator.count_IPs()}, 200

def ip_post_bulk_api(records):
    temp_records = {}

    for record in records:
        try:
            ip = IPv4Address(record['ip'])
            value = float(record['value'])
        except ValueError:
            return {"Status": "error", "Reason": "IP {} or value {} is invalid.".format(record['ip'], record['value'])}, 400
        
        temp_records[ip] = value

    for ip, value in temp_records.items():
        IP_vizualizator.set_ip_record(ip, value)

    return {"Status": "ok"}, 200


def network_get_api(network, mask, resolution = None, test = False):
    try:
        mask = int(mask)
        network = IPv4Network((network, mask))
    except ValueError:
        return {"Status": "error", "Reason": "Network or mask is invalid."}, 400
    
    if mask % 2 != 0:
        return {"Status": "error", "Reason": "Mask must be even number"}, 400


    if resolution is None:
        resolution = mask + 16 if mask + 16 <= 32 else 32
    else:
        try:
            resolution = int(resolution)
        except ValueError:
            return {"Status": "error", "Reason": "Resolution is not int."}, 400
       
        if resolution % 2 != 0 or resolution < network.prefixlen or resolution > 32:
            return {"Status": "error", "Reason": "Resolution is invalid - not even or less than given mask or greater than 32."}, 400

    response = {"Status": "ok", "Network": str(network.network_address), "Mask": str(network.netmask), "Prefix_length": network.prefixlen, "Min_address": str(network.network_address), "Max_address": str(network.broadcast_address), "Pixel_mask": resolution, "Test": test}
    max_value = - math.inf
    min_value = math.inf
    pixels = []

    hilbert_order = int((resolution - network.prefixlen) / 2)
    
    for subnet, value in IP_vizualizator.get_networks_record(network, resolution).items():
        if test is True:
            value = random.randint(0, 1000)

        min_value = value if value < min_value else min_value 
        max_value = value if value > max_value else max_value
        
        index = (int(subnet.network_address) - int(network.network_address)) >> 32-resolution
        x, y = IP_vizualizator.hilbert_i_to_xy(index, hilbert_order)
        
        pixels.append({"y": y, "x": x, "Val": value, "Network": str(subnet)})
                    

    response["Pixels"] = pixels
    response["Max_value"] = max_value
    response["Min_value"] = min_value
    response["Hilbert_order"] = hilbert_order
    
    return response, 200
#################################

def main():
    app = connexion.App(__name__, specification_dir='./api/')
    CORS(app.app)
    app.add_api('api.yaml', arguments={'title': 'IPVizualizator'})
    app.run(port=8080)

