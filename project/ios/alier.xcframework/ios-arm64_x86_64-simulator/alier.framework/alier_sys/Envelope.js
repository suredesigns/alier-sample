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

/**
 * @template T
 */
class Envelope {
    /** @type {Promise<T>} */
    #promise;
    /** @type {(value: T) => void} */
    #resolve;
    /** @type {(reason: any?) => void} */
    #reject;
    /** @type {boolean} */
    #done;

    constructor() {
        this.#promise = new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });
        this.#done = false;
    }

    get done() {
        return this.#done;
    }

    /**
     * @param {T} value
     */
    post(value) {
        this.#resolve(value);
        this.#done = true;
    }

    /**
     * @param {any} [reason]
     */
    discard(reason) {
        this.#reject(reason);
        this.#done = true;
    }

    /**
     * @param {(value: T) => T | PromiseLike<T>} [onFulfilled]
     * @param {(reason: any) => PromiseLike<never>} [onRejected]
     */
    then(onFulfilled, onRejected) {
        return this.#promise.then(onFulfilled, onRejected);
    }
}

export { Envelope };
