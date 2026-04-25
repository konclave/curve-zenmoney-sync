-include .env
export

FUNCTION_NAME   ?= curve-zenmoney-sync
TRIGGER_NAME    ?= curve-email-trigger
SERVICE_ACCOUNT ?= curve-zenmoney-sa
RUNTIME         ?= nodejs22
MEMORY          ?= 256MB
TIMEOUT         ?= 30s

.PHONY: dev test build package deploy create-function create-trigger logs

dev:                        ## Run HTTP server locally
	npm run dev

test:                       ## Run all tests
	npm test

build:                      ## Compile TypeScript → dist/
	npm run build

package: build              ## Build serverless deployment package in .serverless-package/
	rm -rf .serverless-package
	mkdir -p .serverless-package
	cp -r dist/. .serverless-package/
	cp package.json package-lock.json .serverless-package/
	cd .serverless-package && npm ci --omit=dev

deploy: package             ## Deploy new function version to Yandex Cloud
	yc serverless function version create \
		--function-name $(FUNCTION_NAME) \
		--runtime $(RUNTIME) \
		--entrypoint serverless/handler.handler \
		--source-path ./.serverless-package \
		--memory $(MEMORY) \
		--execution-timeout $(TIMEOUT) \
		--environment ZENMONEY_ACCESS_TOKEN=$(ZENMONEY_ACCESS_TOKEN) \
		--environment ZENMONEY_DEFAULT_ACCOUNT_ID=$(ZENMONEY_DEFAULT_ACCOUNT_ID) \
		--environment TELEGRAM_BOT_TOKEN=$(TELEGRAM_BOT_TOKEN) \
		--environment TELEGRAM_CHAT_ID=$(TELEGRAM_CHAT_ID) \
		--environment CURVE_SENDER_EMAIL=$(CURVE_SENDER_EMAIL)

create-function:            ## One-time: create the YC function
	yc serverless function create --name $(FUNCTION_NAME)

create-trigger:             ## One-time: create email trigger pointing at the function
	yc serverless trigger create mail $(TRIGGER_NAME) \
		--invoke-function-name $(FUNCTION_NAME) \
		--invoke-function-service-account-name $(SERVICE_ACCOUNT) \
		--batch-size 1 \
		--batch-cutoff 1s

logs:                       ## Tail live function logs
	yc serverless function logs $(FUNCTION_NAME) --follow

quadlet:                    ## Deploy quadlet service
	cd quadlet && ./setup.sh
