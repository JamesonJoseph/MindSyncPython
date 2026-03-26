import os
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()
MONGO_URI = os.getenv('MONGO_URI')
if not MONGO_URI:
    print('No MONGO_URI')
    exit(1)

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
try:
    client.admin.command('ping')
    print('MongoDB connected')
except Exception as e:
    print(f'Connection error: {e}')
    exit(1)

db = client['mindsync-database']
tasks = db['tasks']
# Find tasks with event_datetime field
cursor = tasks.find().sort('_id', -1).limit(10)
for task in cursor:
    print('_id:', task['_id'])
    print('userId:', task.get('userId'))
    print('title:', task.get('title'))
    print('event_datetime:', task.get('event_datetime'))
    print('date:', task.get('date'))
    print('priority:', task.get('priority'))
    print('time:', task.get('time'))
    print('---')