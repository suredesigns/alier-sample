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

//  This file is intended to be used as a classic script and so
//  any variables and functions including classes defined at
//  the top-level are referred via the globalThis object.
// eslint-disable-next-line no-unused-vars
class MessagePorter {
    /** @type {((message: any) => (undefined | boolean | Promise<void>))[]} */
    #event_listeners = [];

    /**
     * Adds an event listener to handle events.
     * 
     * @param {(message: any) => (undefined | boolean | Promise<void>)} listener 
     * an event listener to be added.
     * 
     * the `message` argument of the listener is provided as a parameter
     * for {@link post()} function.
     * the return value is used to decide whether or not to do the
     * subsequent invocation of the rest of listeners.
     * If the listener returns `true`, the subsequent process is skipped,
     * 
     * @returns the given listener function if it is added to 
     * the list of event listeners or it is already in the list,
     * `undefined` otherwise.
     */
    addListener(listener) {
        if (typeof listener !== "function") { return undefined; }

        const listeners = this.#event_listeners;

        if (!listeners.includes(listener)) {
            listeners.push(listener);
        }

        return listener;
    }

    /**
     * Posts an event to every listeners.
     * 
     * Each of the listeners is invoked in the reverse of
     * the addition order.
     * In addition, if some of the listeners returns `true`, then
     * subsequent invocation of the rest of listeners are skipped.
     * 
     * @param {any} message 
     * An argument to be passed to each of event listeners.
     */
    async post(message) {
        const listeners = this.#event_listeners;
        for (let i = listeners.length - 1; i >= 0; i--) {
            const result = listeners[i](message);
            //  result may be a Promise, so it is needed to test
            //  the result is exactly the same as `true`.
            if(result === true) { break; }
        }
    }

    /**
     * Deletes the given event listener from the target `MessagePorter`.
     * 
     * @param {(message: any) => (undefined | boolean | Promise<void>)} listener 
     * @returns the deleted listener function if deletion is succeeded,
     * `undefined` otherwise.
     */
    deleteListener(listener) {
        const listeners = this.#event_listeners;
        const index = listeners.indexOf(listener);
        return index >= 0 ? listeners.splice(index, 1)[0] : undefined; 
    }
}
