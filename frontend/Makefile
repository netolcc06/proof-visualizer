IMAGE ?= proof-visualizer
PORT ?= 8080

.PHONY: build run

build:
	docker build -t $(IMAGE) .

run:
	docker run --rm -p $(PORT):80 $(IMAGE)
