#!/bin/bash

set -e

docker-compose up -d influx grafana
docker-compose run --rm test
