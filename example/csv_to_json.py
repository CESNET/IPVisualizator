#!/usr/bin/python3


import sys
import csv

print('{')
print('"ips": [')

with open('Data/ip_rep.csv', newline='') as csvfile:
    reader = csv.reader(csvfile, delimiter=',',)
    for row in reader:
        print('{')
        print('"ip":"{}",'.format(row[0]))
        print('"val":{}'.format(row[1]))
        print('},')
    
print(']}')
