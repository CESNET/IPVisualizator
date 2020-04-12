#!/usr/bin/python3
"""
RedisDB - class for communication with redis
"""

import sys
import random
import secrets
import math
import logging
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


class RedisDB:
    def __init__(self, config):
        self.prefix = config["redis"]["data_prefix"]
        self.db = redis.Redis(host=config["redis"]["ip"], port=config["redis"]["port"], db=config["redis"]["db"])

        # initialization of keys
        self.next_user_id_key = "{}:next_user_id".format(self.prefix)
        self.user_tokens_key = "{}:user_authorization".format(self.prefix)
        self.user_prefix = "{}:user".format(self.prefix)

        if self.db.exists(self.next_user_id_key) == 0:
            self.db.set(self.next_user_id_key, "1000")

    def create_user(self, username, uid=None, admin=False, authorization=None):
        if uid is None:
            uid = self.db.incr(self.next_user_id_key)

        if authorization is None:
            authorization = secrets.token_hex(nbytes=16)
            while self.db.hexists(self.user_tokens_key, authorization):
                authorization = secrets.token_hex(nbytes=16)

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

        with self.db.pipeline() as pipe:
            pipe.delete("{}:{}".format(self.user_prefix, uid))
            pipe.hdel(self.user_tokens_key, authorization)
            pipe.execute()
            
        # TODO delete all assigned map

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
