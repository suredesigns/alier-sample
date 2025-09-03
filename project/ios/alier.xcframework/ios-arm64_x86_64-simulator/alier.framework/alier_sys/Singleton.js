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

class Singleton {
    /**
     * A dictionary mapping a constructor of a derived class of
     * `Singletons` to its instance.
     * 
     * This ensures that only one instance of a concrete derived class
     * can be returned from {@link initialize()} function.
     * 
     * @type {Map<function, Singleton>}
     */
    static #instances = new Map();

    constructor() {
    }

    /**
     * Initializes an instance of a derived class of `Singleton`.
     * 
     * If there is an instance already initialized, this function
     * just returns the existing instance.
     * Otherwise, this function marks the target instance as
     * initialized and invoke the given initializer function
     * if provided.
     * 
     * @param {(() => void)?} initializer
     * an optional function used for initializing an instance of
     * a derived class of `Singleton`.
     * 
     * @returns an instance of a concrete derived class of `Singleton`.
     * 
     * If there is an instance already initialized, this function
     * returns the existing instance. Otherwise, this function returns
     * the target instance itself.
     */
    initialize(initializer) {
        if (Singleton.#instances.has(this.constructor)) {
            return Singleton.#instances.get(this.constructor);
        } else {
            Singleton.#instances.set(this.constructor, this);
            if (typeof initializer == "function") {
                initializer();
            }
            return this;
        }
    }
}

export { Singleton };
