#!/usr/bin/python3
"""
IPVizualizator Backend
"""

import sys
import connexion
from connexion.exceptions import OAuthProblem
import random
import math
import logging
from ipaddress import IPv4Address, IPv4Network, AddressValueError
from flask_cors import CORS
from flask import g
import yaml

from redisdb import RedisDB, NotFoundError

CONFIG_FILE = "config/config.yaml"
CONFIG = {}

#################################
# Open Config
with open(CONFIG_FILE, 'r') as data:
    try:
        CONFIG = yaml.safe_load(data)
    except yaml.YAMLError as exc:
        print(exc)
        sys.exit(1)

#################################
# Helpers


def validate_ip_data(records):
    temp_records = []

    for record in records:
        ip = IPv4Address(record["ip"])
        value = float(record["val"])

        temp_records.append({"ip": ip, "value": value})

    return temp_records

#################################
# API


def create_new_dataset_api(user, records):
    try:
        records = validate_ip_data(records["ips"])
    except ValueError:
        return {"status": 400, "detail": "Some IP or value is invalid."}, 400

    user = db.find_user_by_uid(user)
    dataset = db.create_dataset(records, user)

    return {"status": 200, "token": dataset.token }, 200


def update_dataset_api(user, token, records):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    try:
        records = validate_ip_data(records["ips"])
    except ValueError:
        return {"status": 400, "detail": "Some IP or value is invalid."}, 400
    dataset = db.update_dataset(token, records, delete_old_records=True)

    return {"status": 200}, 200


def patch_dataset_api(user, token, records, incr=False, decr=False,):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    try:
        records = validate_ip_data(records["ips"])
    except ValueError:
        return {"status": 400, "detail": "Some IP or value is invalid."}, 400

    if incr is True:
        dataset = db.update_dataset(token, records, update="incr", delete_old_records=False)
    elif decr is True:
        dataset = db.update_dataset(token, records, update="decr", delete_old_records=False)
    else:
        dataset = db.update_dataset(token, records, delete_old_records=False)

    return {"status": 200}, 200


def delete_dataset_api(user, token):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    db.delete_dataset(token)

    return {"status": 200}, 200


def get_ip_api(user, token, ip):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    try:
        ip = IPv4Address(ip)
    except ValueError:
        return {"status": 400, "detail": "IP address is invalid"}, 400

    ip_record = db.get_ip_record(token, ip)

    return {"status": 200, "ip": str(ip_record.ip), "val": ip_record.value}, 200


def delete_ip_api(user, token, ip):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    try:
        ip = IPv4Address(ip)
    except ValueError:
        return {"status": 400, "detail": "IP address is invalid"}, 400

    ip_record = db.delete_ip_record(token, ip)

    return {"status": 200}, 200


def put_ip_api(user, token, ip, value, incr=False, decr=False,):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    try:
        ip = IPv4Address(ip)
        value = float(value)
    except ValueError:
        return {"status": 400, "detail": "IP address or value is invalid"}, 400

    if incr is True:
        dataset = db.update_ip_record(token, ip, value, update="incr")
    elif decr is True:
        dataset = db.update_ip_record(token, ip, value, update="decr")
    else:
        dataset = db.update_ip_record(token, ip, value, update="set")

    return {"status": 200}, 200


def get_map_api(token, network, mask, resolution=None):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    try:
        mask = int(mask)
        network = IPv4Network((network, mask))
    except ValueError:
        return {"status": 400, "detail": "Network or mask is invalid."}, 400

    if mask % 2 != 0:
        return {"status": 400, "detail": "Mask must be even number"}, 400

    if resolution is None:
        resolution = mask + 16 if mask + 16 <= 32 else 32
    else:
        try:
            resolution = int(resolution)
        except ValueError:
            return {"status": 400, "detail": "Resolution is not integer."}, 400

        if resolution % 2 != 0 or resolution < network.prefixlen or resolution > 32:
            return {"status": 400,
                    "detail": "Resolution is invalid - not even or less than given mask or greater than 32."}, 400

    response = {"status": 200, "network": str(network.network_address), "mask": str(network.netmask),
                "prefix_length": network.prefixlen, "min_address": str(network.network_address),
                "max_address": str(network.broadcast_address), "pixel_mask": resolution}
    max_value = - math.inf
    min_value = math.inf
    pixels = []

    hilbert_order = int((resolution - network.prefixlen) / 2)
    dataset = db.get_dataset(token)

    for subnet, value in dataset.get_networks(network, resolution).items():
        min_value = value if value < min_value else min_value
        max_value = value if value > max_value else max_value

        index = (int(subnet.network_address) - int(network.network_address)) >> 32 - resolution
        x, y = dataset.hilbert_i_to_xy(index, hilbert_order)

        pixels.append({"y": y, "x": x, "val": value, "ip": str(subnet)})

    response["pixels"] = pixels
    response["max_value"] = max_value
    response["min_value"] = min_value
    response["hilbert_order"] = hilbert_order

    return response, 200


def create_new_user_api(user):
    user = db.create_user(user["username"])

    return {"id": user.uid, "username": user.username, "authorization": user.authorization}, 200


def delete_user_api(user):
    db.delete_user(uid=user)

    return {"status": 200}, 200


def apikey_auth(token, required_scopes):
    try:
        user = db.find_user_by_authorization(token)
    except NotFoundError:
        raise OAuthProblem("Invalid token")

    return {"uid": user.uid}


#################################


logging.basicConfig(level=logging.INFO)
app = connexion.App(__name__, specification_dir="./api/")
CORS(app.app)
app.add_api("api.yaml", arguments={"title": "IPVizualizator"})
db = RedisDB(CONFIG)

if __name__ == "__main__":
    app.run(port=CONFIG["app"]["port"])
