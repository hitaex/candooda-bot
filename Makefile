# Makefile - build and run helpers
IMAGE_NAME = candooda:latest

.PHONY: build docker-run

build:
	docker build -t $(IMAGE_NAME) .

docker-run:
	docker run -d --name candooda \
	  -e NODE_ENV=production \
	  -v $(PWD):/app \
	  -p 3000:3000 \
	  $(IMAGE_NAME)
