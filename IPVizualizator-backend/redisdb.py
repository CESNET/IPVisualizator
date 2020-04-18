#!/usr/bin/python3
"""
RedisDB - class for communication with redis
"""

import sys
import random
import secrets
import functools 
import logging
import datetime
from itertools import islice
from ipaddress import IPv4Address, IPv4Network, AddressValueError
import redis
import numpy as np


class NotFoundError(Exception):
    pass


class User:
    def __init__(self, record):
        self.uid = int(record[b'uid'].decode("UTF-8"))
        self.username = record[b'username'].decode("UTF-8")
        self.authorization = record[b'authorization'].decode("UTF-8")
        self.admin = True if record[b'admin'] == b'True' else False

    def __str__(self):
        return "User #{}: Username: {}, Admin: {}, Authorization: {}".format(
            self.uid, self.username, self. admin, self.authorization)

    def __repr__(self):
        return "User(uid={},username={},admin={},authorization={}".format(
            self.uid, self.username, self. admin, self.authorization)


class IPRecord:
    def __init__(self, ip, value):
        self.ip = IPv4Address(ip)
        self.value = float(value.decode("UTF-8"))

    def __str__(self):
        return "IPRecord: IP: {}, Value: {}".format(self.ip, self.value)

    def __repr__(self):
        return "IPRecord(ip={},value={})".format(repr(self.ip), self.value)


class DatasetMetadata:
    def __init__(self, token, user, size, dataset_created, dataset_updated, dataset_viewed):
        self.token = token
        self.user = user
        self.size = int(size)
        self.dataset_created = dataset_created
        self.dataset_updated = dataset_updated
        self.dataset_viewed = dataset_viewed

    def __str__(self):
        return "DatasetMetadata: Token: {}, User: {}, Size: {}, Created: {}, Updated: {}, Viewed: {}".format(
            self.token, self.user, self.size, self.dataset_created, self.dataset_updated, self.dataset_updated)

    def __repr__(self):
        return "DatasetMetadata(token={}, user={},size={},created={},updated={},viewed={}".format(
            self.token, repr(self.user), self.size, repr(self.dataset_created), repr(self.dataset_updated),
            repr(self.dataset_updated))


class Dataset:
    def __init__(self, metadata, records=None, cache=None):
        self.metadata = metadata
        self.ip_records = {}
        self.cache = None

        logging.info("pripravuji dataset: {}".format(datetime.datetime.utcnow()))
        if cache is not None:
            self.cache = {}
            for key, val in cache.items():
                self.cache[int(key.decode("UTF-8"))] = float(val.decode("UTF-8"))
        else:
            #self.ip_records = records
            for key, val in records.items():
                self.ip_records[key.decode("UTF-8")] = float(val.decode("UTF-8"))
        logging.info("hotovy dataset: {}".format(datetime.datetime.utcnow()))

    def hilbert_i_to_xy(self, ix, order):
        state = 0
        x = 0
        y = 0

        for it in range(2 * order - 2, -2, -2):
            row = 4 * state | ((ix >> it) & 3)
            x = (x << 1) | ((0x936C >> row) & 1)
            y = (y << 1) | ((0x39C6 >> row) & 1)
            state = (0x3E6B94C1 >> 2 * row) & 3

        return x, y

    def size(self):
        return len(self.ip_records)

    def get_network(self, network):
        value = 0.0

        for key, val in self.ip_records.items():
            ip = IPv4Address(key.decode("UTF-8"))
            if ip in network:
                value += float(val.decode("UTF-8"))

        return value

    def get_networks(self, network, resolution):
        subnets = {}

        logging.info("pripravuji networks: {}".format(datetime.datetime.utcnow()))
        subnets = np.zeros(2**(resolution-network.prefixlen))

        logging.info("hotovo networks: {}".format(datetime.datetime.utcnow()))
        network_integer = int(network.network_address)
        if self.cache is not None:
            data = self.cache
        else:
            data = self.ip_records
        for key, val in data.items():
            if self.cache is not None:
                ip = key
                ip = ip << 16
            else:
                ip = functools.reduce(lambda out, x: (out << 8) + int(x), key.split('.'), 0)
            ip_network = (ip >> 32 - network.prefixlen) << 32 - network.prefixlen
            if network_integer == ip_network:
                ip = (ip >> 32-resolution) << 32-resolution
                index = (ip-network_integer) >> 32 - resolution
                subnets[index] += val

        logging.info("hotovo subnets: {}".format(datetime.datetime.utcnow()))
        return subnets

    def __str__(self):
        string = "Dataset: {}, IPs : [".format(self.metadata)
        for ip in self.ip_records:
            string += "{}".format(ip)
        string += "]"

        return string

    def __repr__(self):
        string = "Dataset({},IPs=[".format(repr(self.metadata))
        for ip in self.ip_records:
            string += "{},".format(repr(ip))
        string += "])"

        return string


class RedisDB:
    def __init__(self, config):
        self.prefix = config["redis"]["data_prefix"]
        self.db = redis.Redis(host=config["redis"]["ip"], port=config["redis"]["port"], db=config["redis"]["db"])

        # keys and prefixes in redis database
        self.next_user_id_key = "{}:next_user_id".format(self.prefix)
        self.user_tokens_key = "{}:user_authorization".format(self.prefix)
        self.user_prefix = "{}:user".format(self.prefix)
        self.dataset_prefix = "{}:dataset".format(self.prefix)
        self.dataset_cache_prefix = "{}:dataset_cache".format(self.prefix)
        self.dataset_key = "{}:datasets".format(self.prefix)
        self.dataset_owned_prefix = "{}:dataset_owned".format(self.prefix)
        self.dataset_owner_prefix = "{}:dataset_owner".format(self.prefix)
        self.dataset_created_prefix = "{}:dataset_created".format(self.prefix)
        self.dataset_updated_prefix = "{}:dataset_updated".format(self.prefix)
        self.dataset_viewed_prefix = "{}:dataset_viewed".format(self.prefix)

        # Populate DB with initial data
        if self.db.exists(self.next_user_id_key) == 0:
            self.db.set(self.next_user_id_key, "1000")

        if "users" in config:
            for user in config["users"]:
                self.create_user(user["username"], user["uid"], user["admin"], user["authorization"])

    def create_user(self, username, uid=None, admin=False, authorization=None):
        if uid is None:
            uid = self.db.incr(self.next_user_id_key)

        if authorization is None:
            authorization = secrets.token_hex(nbytes=16)
            while self.db.hexists(self.user_tokens_key, authorization):
                authorization = secrets.token_hex(nbytes=16)

        if self.db.exists("{}:{}".format(self.user_prefix, uid)) == 1:
            old_authorization = self.db.hget("{}:{}".format(self.user_prefix, uid), "authorization")
            self.db.hdel(self.user_tokens_key, old_authorization)

        user = {"uid": uid, "username": username, "admin": str(admin), "authorization": authorization}

        with self.db.pipeline() as pipe:
            pipe.hmset("{}:{}".format(self.user_prefix, uid), user)
            pipe.hset(self.user_tokens_key, authorization, uid)
            pipe.execute()

        return self.find_user_by_authorization(authorization)

    def delete_user(self, uid=None, authorization=None):
        if uid is not None:
            user = self.find_user_by_uid(uid)
            authorization = user.authorization

        if authorization is not None:
            user = self.find_user_by_authorization(authorization)
            uid = user.uid

        datasets = []
        if self.db.exists("{}:{}".format(self.dataset_owned_prefix, uid)) == 1:
            datasets = self.db.smembers("{}:{}".format(self.dataset_owned_prefix, uid))

        for dataset in datasets:
            self.delete_dataset(dataset.decode("UTF-8"))

        with self.db.pipeline() as pipe:
            pipe.delete("{}:{}".format(self.user_prefix, uid))
            pipe.hdel(self.user_tokens_key, authorization)
            pipe.execute()

    def find_user_by_authorization(self, authorization):
        if self.db.hexists(self.user_tokens_key, authorization) is False:
            raise NotFoundError("User token doesn't exist")

        uid = self.db.hget(self.user_tokens_key, authorization).decode("UTF-8")
        record = self.db.hgetall("{}:{}".format(self.user_prefix, uid))

        return User(record)

    def find_user_by_uid(self, uid):
        if self.db.exists("{}:{}".format(self.user_prefix, uid)) == 0:
            raise NotFoundError("User doesn't exist")

        record = self.db.hgetall("{}:{}".format(self.user_prefix, uid))

        return User(record)

    def user_permission(self, user, token):
        key = "{}:{}".format(self.dataset_owned_prefix, user.uid)
        if self.db.exists(key) == 1 and self.db.sismember(key, token) is True:
            return True
        elif user.admin is True:
            return True
        else:
            return False

    def chunks(self, data, size=10000):
        it = iter(data)
        for i in range(0, len(data), size):
            yield {k: data[k] for k in islice(it, size)}

    def create_dataset(self, ips, user):
        token = secrets.token_urlsafe(nbytes=16)
        while self.db.sismember(self.dataset_key, token):
            token = secrets.token_urlsafe(nbytes=16)

        #Uprava dat
        dataset_cache = {}
        dataset_subnets = []
        for i in range(0, 65535):
            dataset_subnets.append({})
            dataset_cache[i] = 0.0

        for ip, value in ips.items():
            ip_index = functools.reduce(lambda out, x: (out << 8) + int(x), ip.split('.'), 0) >> 16
            dataset_cache[ip_index] += value
            dataset_subnets[ip_index][ip] = value

        logging.info("pred pipeline: {}".format(datetime.datetime.utcnow()))
        with self.db.pipeline() as pipe:
            pipe.sadd(self.dataset_key, token)
            pipe.sadd("{}:{}".format(self.dataset_owned_prefix, user.uid), token)
            pipe.set("{}:{}".format(self.dataset_owner_prefix, token), user.uid)
            pipe.hmset("{}:{}".format(self.dataset_cache_prefix, token), mapping=dataset_cache)
            for i in range(0, 65535):
                if len(dataset_subnets[i]) != 0:
                    for record in self.chunks(dataset_subnets[i], 10000):
                        pipe.hmset("{}:{}:{}".format(self.dataset_prefix, token, i), mapping=record)
            logging.info("pred execute: {}".format(datetime.datetime.utcnow()))
            pipe.execute()
            logging.info("po execute: {}".format(datetime.datetime.utcnow()))

        time = datetime.datetime.utcnow()
        self.set_dataset_created(token, time)
        self.set_dataset_updated(token, time)
        self.set_dataset_viewed(token, time)

        return DatasetMetadata(token, user, len(ips), time, time, time)

    def update_dataset(self, token, ips, update="set", delete_old_records=False):
        if delete_old_records is True:
            self.db.delete("{}:{}".format(self.dataset_prefix, token))

        #TODO neefektivni
        if update == "incr":
            for ip in ips:
                self.update_ip_record(token, str(ip["ip"]), ip["value"], update="incr")
        elif update == "decr":
            for ip in ips:
                self.update_ip_record(token, str(ip["ip"]), ip["value"], update="decr")
        else:
            with self.db.pipeline() as pipe:
                for ip in ips:
                    pipe.hset("{}:{}".format(self.dataset_prefix, token), str(ip["ip"]), ip["value"])
                pipe.execute()

        time = datetime.datetime.utcnow()
        self.set_dataset_updated(token, time)
        self.set_dataset_viewed(token, time)

        uid = self.db.get("{}:{}".format(self.dataset_owner_prefix, token)).decode("UTF-8")
        user = self.find_user_by_uid(uid)

        return DatasetMetadata(token, user, len(ip), self.get_dataset_created(token), time, time)

    def delete_dataset(self, token):
        uid = self.db.get("{}:{}".format(self.dataset_owner_prefix, token)).decode("UTF-8")
        with self.db.pipeline() as pipe:
            pipe.srem(self.dataset_key, token)
            pipe.srem("{}:{}".format(self.dataset_owned_prefix, uid), token)
            pipe.delete("{}:{}".format(self.dataset_owner_prefix, token))
            pipe.delete("{}:{}".format(self.dataset_created_prefix, token))
            pipe.delete("{}:{}".format(self.dataset_updated_prefix, token))
            pipe.delete("{}:{}".format(self.dataset_viewed_prefix, token))
            pipe.delete("{}:{}".format(self.dataset_prefix, token))
            pipe.execute()

    def get_dataset(self, token, network, resolution):
        logging.info("pripravuji redis: {}".format(datetime.datetime.utcnow()))
        if resolution <= 16:
            data = self.db.hgetall("{}:{}".format(self.dataset_cache_prefix, token))
            metadata = self.get_dataset_metadata(token)
            self.set_dataset_viewed(token, datetime.datetime.utcnow())
            logging.info("hotovo redis: {}".format(datetime.datetime.utcnow()))

            return Dataset(metadata, cache=data)
        else:
            data = {}
            if network.prefixlen >= 16:
                index = int(network.network_address) >> 16
                key = "{}:{}:{}".format(self.dataset_prefix, token, index)
                if self.db.exists(key) == 1:
                    data = self.db.hgetall(key)
            else:
                subnets = network.subnets(new_prefix=16)
                for subnet in subnets:
                    key = "{}:{}:{}".format(self.dataset_prefix, token, int(subnet.network_address) >> 16)
                    if self.db.exists(key):
                        data.update(self.db.hgetall(key))

            metadata = self.get_dataset_metadata(token)
            self.set_dataset_viewed(token, datetime.datetime.utcnow())
            logging.info("hotovo redis: {}".format(datetime.datetime.utcnow()))

            return Dataset(metadata, records=data)

    def dataset_exist(self, token):
        return self.db.sismember(self.dataset_key, token)

    def get_dataset_size(self, token):
        return self.db.hlen("{}:{}".format(self.dataset_prefix, token))

    def get_dataset_metadata(self, token):
        authorization = self.db.get("{}:{}".format(self.dataset_owner_prefix, token))
        user = self.find_user_by_uid(authorization.decode("UTF-8"))
        size = self.get_dataset_size(token)
        dataset_created = self.get_dataset_created(token)
        dataset_updated = self.get_dataset_updated(token)
        dataset_viewed = self.get_dataset_viewed(token)

        return DatasetMetadata(token, user, size, dataset_created, dataset_updated, dataset_viewed)

    def set_ip_record(self, token, ip, value):
        self.db.hset("{}:{}".format(self.dataset_prefix, token), ip, value)
        time = datetime.datetime.utcnow()
        self.set_dataset_updated(token, time)
        self.set_dataset_viewed(token, time)

        return self.get_ip_record(token, ip)

    def ip_record_exist(self, token, ip):
        return self.db.hexists("{}:{}".format(self.dataset_prefix, token), ip)

    def get_ip_record(self, token, ip):
        value = self.db.hget("{}:{}".format(self.dataset_prefix, token), str(ip))

        if value is None:
            value = b'0'

        self.set_dataset_viewed(token, datetime.datetime.utcnow())

        return IPRecord(ip, value)

    def delete_ip_record(self, token, ip):
        self.db.hdel("{}:{}".format(self.dataset_prefix, token), str(ip))

        time = datetime.datetime.utcnow()
        self.set_dataset_updated(token, time)
        self.set_dataset_viewed(token, time)

    def update_ip_record(self, token, ip, value, update="set"):
        ip = str(ip)
        if update == "incr":
            if self.ip_record_exist(token, ip):
                ip_record = self.get_ip_record(token, ip)
            else:
                ip_record = IPRecord(ip, b'0')
            ip_record = self.set_ip_record(token, ip, float(value) + ip_record.value)
        elif update == "decr":
            if self.ip_record_exist(token, ip):
                ip_record = self.get_ip_record(token, ip)
            else:
                ip_record = IPRecord(ip, b'0')
            ip_record = self.set_ip_record(token, ip, ip_record.value - float(value))
        else:
            ip_record = self.set_ip_record(token, ip, value)

        return ip_record

    def set_dataset_created(self, token, time):
        time = int(time.timestamp())
        self.db.set("{}:{}".format(self.dataset_created_prefix, token), time)

    def set_dataset_updated(self, token, time):
        time = int(time.timestamp())
        self.db.set("{}:{}".format(self.dataset_updated_prefix, token), time)

    def set_dataset_viewed(self, token, time):
        time = int(time.timestamp())
        self.db.set("{}:{}".format(self.dataset_viewed_prefix, token), time)

    def get_dataset_created(self, token):
        timestamp = int(self.db.get("{}:{}".format(self.dataset_created_prefix, token)).decode("UTF-8"))
        return datetime.datetime.fromtimestamp(timestamp)

    def get_dataset_updated(self, token):
        timestamp = int(self.db.get("{}:{}".format(self.dataset_updated_prefix, token)).decode("UTF-8"))
        return datetime.datetime.fromtimestamp(timestamp)

    def get_dataset_viewed(self, token):
        timestamp = int(self.db.get("{}:{}".format(self.dataset_viewed_prefix, token)).decode("UTF-8"))
        return datetime.datetime.fromtimestamp(timestamp)
