#!/usr/bin/python3

from ipaddress import IPv4Address, IPv4Network, AddressValueError

class IPRecords:
    
    def __init__(self):
        self.records = {}

    def size(self):
        return len(self.records)

    def set(self, ip, value):
        self.records[ip] = float(value)

    def delete(self, ip):
        if ip in self.records:
            self.records.pop(ip)

    def add(self, ip, value):
        if ip in self.records:
            self.records[ip] += float(value)
        else:
            self.set(ip, value)

    def subtract(self, ip, value):
        if ip in self.records:
            self.records[ip] -= float(value)
        else:
            self.set(ip, value)

    def get(self, ip):
        if ip in self.records:
            return self.records[ip]
        else:
            return 0.0

    def get_network(self, network):
        value = 0.0

        for ip, val in self.records.items():
            if ip in network:
                value += val

        return value

    def get_networks(self, network, resolution):
        subnets ={}

        for subnet in network.subnets(new_prefix = resolution):
            subnets[subnet] = 0.0

        for ip, val in self.records.items():
            if ip in network:
                ip = (int(ip) >> 32-resolution) << 32-resolution
                index = IPv4Network((ip, resolution))
                subnets[index] += val

        return subnets


