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

const _secret = Symbol();

class WaitObject {

    constructor(secret) {
        if (secret !== _secret) {
            this.#key = Symbol();
        }
    }

    then(onSettled) {
        const derived = new WaitObject();

        const on_settled = typeof onSettled === "function" ?
            onSettled :
            result => result
        ;

        derived.#on_settled = (result) => {
            try {
                const value = on_settled(result);
                return { status: "fulfilled", value };
            } catch (reason) {
                return { status: "rejected", reason };
            }
        };

        this.#derived_objects.push(derived);

        switch (this.#status) {
            case "fulfilled": {
                this.#settle("fulfilled", this.#last_result, true);
                break;
            }
            case "rejected": {
                this.#settle("rejected", this.#last_result, true);
                break;
            }
        }

        return derived;
    }

    dependsOn(thenable) {
        const thenable_ = (typeof thenable?.then === "function") ? thenable : Promise.resolve(thenable);
        const resolve = () => this.#settle("fulfilled", undefined, false);
        const reject  = (reason) => this.#settle("rejected", reason, false);

        thenable_.then(resolve, reject);

        return this;
    }

    static keyFor(waitObject) {
        return (waitObject instanceof WaitObject) ? waitObject.#key : undefined;
    }

    static for(key) {
        let key_ = key;

        if (key_ == null) {
            throw new TypeError("key is nullish");
        } else if (typeof key_.toString !== "function") {
            throw new TypeError("key cannot be converted to string");
        }

        if (typeof key_ === "symbol") {
            key_ = WaitObject.#keys.get(key_.description) ?? key_;
        } else {
            if (typeof key_ !== "string") {
                key_ = String(key_);
            }
            key_ = WaitObject.#keys.get(key_) ?? Symbol(key_);
        }

        const hit = WaitObject.#key_map.get(key_);
        if (hit != null) { return hit; }

        const new_wo = new WaitObject(_secret);

        new_wo.#key = key_;
        WaitObject.#keys.set(key_.description, key_);
        WaitObject.#key_map.set(key_, new_wo);

        return new_wo;
    }

    static withResolvers() {
        const wo = new WaitObject();

        return {
            promise:  wo,
            resolve: () => wo.#settle("fulfilled", undefined, true),
            reject : (reason) => wo.#settle("rejected", reason, true)
        };
    }

    withTimeout(timeout) {
        const timeout_ = (
            typeof timeout === "symbol" ||
            typeof timeout?.toString !== "function"
        ) ?
            -1 :
            Math.trunc(Number(timeout) || -1)
        ;

        clearTimeout(this.#timeout_id);
        this.#timeout_id = 0;

        if (0 <= timeout_ && timeout_ < Number.POSITIVE_INFINITY) {
            this.#timeout_id = setTimeout(() => {
                const key_desc = this.#key.description;
                const elapsed_ms = timeout_.toLocaleString("en");
                const error_message = `${key_desc} timed out (${elapsed_ms} ms elapsed)`;
                this.#settle("rejected", new Error(error_message), false);
            }, timeout_);
        }

        return this;
    }

    /**
     * @param {"fulfilled" | "rejected" } status
     * @param {*} valueOrReason 
     * @param {boolean} asMicrotask
     */
    #settle(status, valueOrReason, asMicrotask) {
        const as_microtask = !!asMicrotask;
        let status_ = status;
        let value_or_reason = valueOrReason;

        const task = () => {
            const prev_status = this.#status;

            if (this.#on_settled == null) {
                this.#on_settled = (result) => result;
            }
            try {
                const result = this.#on_settled(
                    (prev_status === "fulfilled") ?
                        { status: "fulfilled", value : this.#last_result } :
                    (prev_status === "rejected") ?
                        { status: "rejected" , reason: this.#last_result } :
                    (status_ === "fulfilled") ?
                        { status: "fulfilled", value : value_or_reason } :
                        { status: "rejected" , reason: value_or_reason }
                );

                if (typeof result?.then === "function") {
                    result.then(
                        value  => this.#settle("fulfilled", value, false),
                        reason => this.#settle("rejected", reason, false)
                    );
                    return;
                }
                status_ = result?.status ?? status_;
                value_or_reason = (status_ === "fulfilled") ? result?.value : result?.reason;
            } catch (reason) {
                value_or_reason = reason?.reason ?? reason;
                status_ = "rejected";
            }

            this.#status = status_; 

            if (prev_status === "pending") {
                WaitObject.#key_map.delete(this.#key);
                WaitObject.#keys.delete(this.#key.description);
                clearTimeout(this.#timeout_id);
                this.#timeout_id  = 0;
                this.#last_result = value_or_reason;
            }

            for (const derived of this.#derived_objects.splice(0, Number.MAX_VALUE)) {
                derived.#settle(status_, this.#last_result, false);
            }
        };

        (as_microtask ? queueMicrotask(task) : task());
    }

    /** @type {"pending" | "fulfilled" | "rejected"} */
    #status = "pending";

    #last_result = undefined;

    /** @type {symbol} */
    #key;

    /** @type {number} */
    #timeout_id = 0;

    /**
     * @type {((result: {status: "fulfilled", value?: any } | { status: "rejected", reason?: any }) => result)?} 
     */
    #on_settled = undefined;

    /** @type {WaitObject[]} */
    #derived_objects = [];

    /** @type {Map<symbol, WaitObject>} */
    static #key_map = new Map();

    /** @type {Map<string, symbol>} */
    static #keys = new Map();
}

export { WaitObject };
