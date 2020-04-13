#!/usr/bin/python3
"""
RedisDB - class for communication with redis
"""

import sys
import random
import secrets
import math
import logging
import datetime
from ipaddress import IPv4Address, IPv4Network, AddressValueError
import redis


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
    def __init__(self, metadata, records):
        self.metadata = metadata
        self.ip_records = []
        for key, val in records.items():
            self.ip_records.append(IPRecord(key.decode("UTF-8"), val))

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

    def create_dataset(self, ips, user):
        token = secrets.token_urlsafe(nbytes=16)
        while self.db.sismember(self.dataset_key, token):
            token = secrets.token_urlsafe(nbytes=16)

        with self.db.pipeline() as pipe:
            pipe.sadd(self.dataset_key, token)
            pipe.sadd("{}:{}".format(self.dataset_owned_prefix, user.uid), token)
            pipe.set("{}:{}".format(self.dataset_owner_prefix, token), user.uid)
            for ip in ips:
                pipe.hset("{}:{}".format(self.dataset_prefix, token), ip["ip"], ip["val"])
            pipe.execute()

        time = datetime.datetime.utcnow()
        self.set_dataset_created(token, time)
        self.set_dataset_updated(token, time)
        self.set_dataset_viewed(token, time)

        return DatasetMetadata(token, user, len(ip), time, time, time)

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

    def get_dataset(self, token):
        data = self.db.hgetall("{}:{}".format(self.dataset_prefix, token))
        metadata = self.get_dataset_metadata(token)
        self.set_dataset_viewed(token, datetime.datetime.utcnow())

        return Dataset(metadata, data)

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
        self.set_dataset_viewed(token, datetime.datetime.utcnow())

        return IPRecord(ip, value)

    def delete_ip_record(self, token, ip):
        self.db.hdel("{}:{}".format(self.dataset_prefix, token), str(ip))

        time = datetime.datetime.utcnow()
        self.set_dataset_updated(token, time)
        self.set_dataset_viewed(token, time)

    def update_ip_record(self, token, ip, value, update="set"):
        if update == "incr":
            ip_record = self.get_ip_record(token, ip)
            ip_record = self.set_ip_record(token, ip, float(value) + ip_record.value)
        elif update == "decr":
            ip_record = self.get_ip_record(token, ip)
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
