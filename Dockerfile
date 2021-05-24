FROM tiangolo/uwsgi-nginx-flask:python3.7

COPY ./IPVisualizator-backend /app

RUN python3 -m pip install -r /app/requirements.txt


