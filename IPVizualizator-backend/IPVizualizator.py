#!/usr/bin/python3
"""
IPVizualizator Backend
"""

import sys
import connexion
from connexion.exceptions import OAuthProblem
import datetime
import math
import logging
from ipaddress import IPv4Address, IPv4Network, AddressValueError
from flask_cors import CORS
from flask import Response
import yaml
import json
import numpy as np
import re
from jsonschema import draft4_format_checker

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



IP_RE = re.compile("^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$")

@draft4_format_checker.checks("ip")
def is_ip(val):
    if not isinstance(val, str):
                    return True
    return IP_RE.match(val) is not None


def convert_ip_data_from_csv(records):
    temp_records = {}

    for record in records.splitlines():
        record = record.decode().strip()

        if record[0] == "#":
            continue
        record = record.split(',')

        if len(record) != 2:
            raise ValueError

        if IP_RE.match(record[0]) is None:
            raise ValueError

        ip = record[0]
        value = float(record[1])

        temp_records[ip] = value

    return temp_records

#################################
# API


def create_new_dataset_api(user, records):
    logging.info("zacatek: {}".format(datetime.datetime.utcnow()))

    try:
        records = convert_ip_data_from_csv(records)
    except ValueError:
        return {"status": 400, "detail": "CSV format, some IP or value is invalid."}, 400

    if len(records) == 0:
        return {"status": 400, "detail": "No data provided."}, 400

    logging.info("zpracovano csv: {}".format(datetime.datetime.utcnow()))
    user = db.find_user_by_uid(user)
    dataset = db.create_dataset(records, user)

    return {"status": 200, "token": dataset.token}, 200



def update_dataset_api(user, token, records):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    try:
        records = convert_ip_data_from_csv(records)
    except ValueError:
        return {"status": 400, "detail": "CSV format, some IP or value is invalid."}, 400

    if len(records) == 0:
        return {"status": 400, "detail": "No data provided."}, 400

    dataset = db.update_dataset(token, records, update="set")

    return {"status": 200}, 200


def patch_dataset_api(user, token, records, incr=False, decr=False, ):
    if db.dataset_exist(token) is False:
        return {"status": 404, "detail": "Dataset not found"}, 404

    user = db.find_user_by_uid(user)

    if db.user_permission(user, token) is False:
        return {"status": 401, "detail": "User doesn't have a permission to manipulate with this dataset"}, 401

    try:
        records = convert_ip_data_from_csv(records)
    except ValueError:
        return {"status": 400, "detail": "CSV format, some IP or value is invalid."}, 400

    if len(records) == 0:
        return {"status": 400, "detail": "No data provided."}, 400

    if incr is True:
        dataset = db.update_dataset(token, records, update="incr")
    elif decr is True:
        dataset = db.update_dataset(token, records, update="decr")
    else:
        dataset = db.update_dataset(token, records, update="patch")

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


def put_ip_api(user, token, ip, value, incr=False, decr=False, ):
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

    response = {"status": 200, "network": str(network.network_address), "mask": str(network.netmask), "prefix_length": network.prefixlen, "min_address": str(network.network_address), "max_address": str(network.broadcast_address), "pixel_mask": resolution}


    hilbert_order = int((resolution - network.prefixlen) / 2)
    dataset = db.get_dataset(token, network, resolution)
    networks = dataset.get_networks(network, resolution)
    logging.info("pripravuji hilbertovu mapu: {}".format(datetime.datetime.utcnow()))

    max_value = - math.inf
    min_value = math.inf

    round_p = float(10**5)
    pixels = []
    for index, value in enumerate(networks):

        # faster rounding of value to 5 decimal digit
        value = int(value * round_p + 0.5)/round_p
        min_value = value if value < min_value else min_value
        max_value = value if value > max_value else max_value
        #subnet = IPv4Network(subnet)
        #index = (int(subnet.network_address) - int(network.network_address)) >> 32 - resolution
        x, y = dataset.hilbert_i_to_xy(index, hilbert_order)

        pixels.append({"y": y, "x": x, "val": value, "ip": "{}/{}".format(str(network.network_address+(index << 32-resolution)),str(resolution))})

    response["pixels"] = pixels
    response["max_value"] = max_value
    response["min_value"] = min_value
    response["hilbert_order"] = hilbert_order

    logging.info("hotovo hilbertovu mapu: {}".format(datetime.datetime.utcnow()))
    return Response(json.dumps(response, separators=(',', ':')), status=200, mimetype='application/json')


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

application = app.app

if __name__ == "__main__":
    app.run(port=CONFIG["app"]["port"])
