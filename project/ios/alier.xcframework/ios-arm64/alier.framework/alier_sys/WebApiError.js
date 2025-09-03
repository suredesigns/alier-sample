/*
Copyright 2024 Suredesigns Corp.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

class WebApiError extends Error {

    get statusCode() {
        return this.#status_code;
    }

    /**
     * 
     * @param {number} statusCode 
     * @param {string} statusMessage 
     * @param {({ cause: Error? })} options 
     */
    constructor(statusCode, statusMessage, options) {
        //  The message property is set after Error.constructor() is done.
        //  It is allowed because message property is writable.
        super("", options);

        let status_code_ = Number(
            // Object.create(null) cannot be converted to a string
            (statusCode == null || (Object.getPrototypeOf(statusCode) == null)) ?
                500 :
                String(statusCode)
        );
        if (!(Number.isInteger(status_code_) && 100 <= status_code_ && status_code_ <= 599)) {
            status_code_ = 500;
        }

        const status_message_ = (
            // Object.create(null) cannot be converted to a string
            (statusMessage == null || (Object.getPrototypeOf(statusMessage) == null)) ?
                "Internal Server Error" :
                String(statusMessage)
        );

        // Error.message is writable
        super.message     = `${status_code_}: ${status_message_}`;
        this.#status_code = status_code_;
    }

    #status_code;
}

export {
    WebApiError
};
