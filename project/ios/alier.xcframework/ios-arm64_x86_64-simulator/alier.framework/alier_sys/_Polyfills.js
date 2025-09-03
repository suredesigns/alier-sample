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

const __globalThis__ = (globalThis !== undefined) ?
    globalThis : (self !== undefined) ?
    self       : (window !== undefined) ?
    window     : (global !== undefined) ?
    global     :
    undefined
;

const __POLYFILL_MARKER__ = Symbol("polyfill");
const _uses_polyfill = (x) => {
    while ((x !== null && typeof x === "object") || typeof x === "function") {
        if (__POLYFILL_MARKER__ in x) {
            return true;
        }
        if (typeof x === "function") {
            x = x.prototype;
        } else {
            break;
        }
    }
    return false;
};


/**
 * Polyfill for WeakRef class.
 * 
 * This mimics native WeakRef's interface but it has a strong reference to the target instead of a weak reference.
 */
const WeakRef = __globalThis__.WeakRef !== undefined ?
    __globalThis__.WeakRef :
    class {
        #target;
        get [__POLYFILL_MARKER__]() {
            return true;
        }
        get [Symbol.toStringTag]() {
            return "WeakRef";
        }
        constructor(target) {
            if (target === undefined) {
                throw new TypeError(`${target} is not a non-null object`);
            } else if (!(
                (target !== null && typeof target === "object") ||
                (typeof target === "symbol" && Symbol.keyFor(target) === undefined)
            )) {
                throw new TypeError(`${target} cannot be held weakly`);
            }
            this.#target = target;
        }
        deref() {
            return this.#target;
        }
    }
;

export {
    WeakRef,
    _uses_polyfill,
};
