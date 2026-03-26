import os
from pymongo import MongoClient
from dotenv import load_dotenv

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
count = tasks.count_documents({})
print(f'Total tasks: {count}')
for task in tasks.find().limit(10):
    print(task)