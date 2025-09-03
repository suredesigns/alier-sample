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

class PromisePool {
    static #pool = new Set();
    static #pendings = new WeakSet();

    static waitAll() {
        const queued = [...PromisePool.#pool];
        PromisePool.#pool.clear();
        const all_settled = Promise.allSettled(queued).then(() => {
            PromisePool.#pool.delete(all_settled);
        });
        PromisePool.#pool.add(all_settled);
        return all_settled;
    }

    /**
     * @template T
     * @param {({ then(onResolve: (value: T)=>any, onReject: (reason: Error) => any) })} thenable 
     * @returns 
     */
    static add(thenable) {

        const thenable_ = typeof thenable?.then === "function" ? thenable : Promise.resolve(thenable);

        if (PromisePool.#pendings.has(thenable_)) { return; }

        const pooled = thenable_.then(() => {
            PromisePool.#pendings.delete(thenable_);
            PromisePool.#pool.delete(pooled);
        }, () => {
            PromisePool.#pendings.delete(thenable_);
            PromisePool.#pool.delete(pooled);
        });

        PromisePool.#pendings.add(thenable_);
        PromisePool.#pool.add(pooled);
    }
}

export { PromisePool };
