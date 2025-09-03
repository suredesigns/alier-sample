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

const isEmpty = (o) => {
    if (o === null || (typeof o !== "string" && typeof o !== "function" && typeof o !== "object")) {
        return true;
    } else if (typeof o === "string") {
        return o === "";
    } else if (Array.isArray(o)) {
        return o.length === 0;
    } else if (typeof o[Symbol.iterator] === "function") {
        for (const _ of o) {
            return false;
        }
        return true;
    } else {
        for (const k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k)) {
                return false;
            }
        }
        return true;
    }
};

/**
 * Converts the given string to a value of the given type.
 * 
 *  @param {string} s a string representing a serialized value
 *  @param {function} ctor a destination type
 */
const _strto = (s, ctor) => {
    if (typeof s !== "string") { return s; }
    switch (ctor) {
        case BigInt: {
            return BigInt(s);
        }
        case Boolean: {
            return s === "true" ? true : (s === "false" ? false : s);
        }
        case Number: {
            //  Number(" ") returns 0 instead of NaN. Hence testing whether or not s is spaces/empty before type conversion.
            if (/^\s*$/.test(s)) { return s; }
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
        }
        case String: {
            return s;
        }
        case null: {
            return s;
        }
        case undefined: {
            return s;
        }
        default: {
            return s;
        }
    }
};

class TwoWayDataConnector {
    #source;
    #target;
    
    get target() {
        return this.#target;
    }

    constructor(source, target) {
        this.#source = source;
        this.#target = new WeakRef(target);
    }

    curateValues() {
        return this.#source.curateValues();
    }

    reflectValues(valueMap) {
        const target = this.target.deref();
        if (target === undefined) {
            return Object.create(null);
        }
        return this.#source.reflectValues(valueMap);
    }
}


class OneWayDataConnector {
    #source;
    #target;
    
    get target() {
        return this.#target;
    }

    constructor(source, target) {
        this.#source = source;
        this.#target = new WeakRef(target);
    }

    curateValues() {
        return this.#source.curateValues();
    }

    reflectValues(valueMap) {
        const value_map = valueMap;
        const target    = this.target.deref();
        if (target === undefined) {
            return Object.create(null);
        }

        const source_state = this.curateValues();
        const diff = Object.create(null);
        for (const k in source_state) {
            if (!Object.prototype.hasOwnProperty.call(value_map, k)) { continue; }
            
            const source_value = source_state[k];

            const target_value_equiv = _strto(value_map[k], source_value?.constructor);
            if (target_value_equiv !== source_value) {
                diff[k] = source_value;
            }
        }

        //  if diff has a property, reflect it into the target.
        for (const _ in diff) {
            //  since diff is null-prototype, all properties are its own properties.
            return target.reflectValues(Object.freeze(diff));
        }
        //  otherwise, return an empty object.
        return Object.create(null);
    }
}

class ObservableObject {

    #proxy;
    #connectors = new Set();
    #allowsTwoWay;
    #datatypes = new Map();

    get allowsTwoWay() {
        return this.#allowsTwoWay;
    }
    constructor(data, allowsTwoWay = false) {

        if (data === null || typeof data !== "object") {
            throw new TypeError(`${data} is not a non-null object`);
        } else if (typeof allowsTwoWay !== "boolean") {
            throw new TypeError(`${allowsTwoWay} is not a boolean`);
        }

        this.#allowsTwoWay = allowsTwoWay;
        for (const k in data) {
            this.#datatypes.set(k, typeof data[k]);
        }
        Object.assign(this, data);

        const reflect = (value_map) => {
            for (const connector of this.#connectors) {
                const target = connector.target.deref();
                if (target === undefined) {
                    this.#connectors.delete(connector);
                } else {
                    target.reflectValues(value_map);
                }
            }
        };
        const datatypes    = this.#datatypes;
        const delegate_map = new Map();
        this.#proxy = new Proxy(this, {
            get (self, key, proxy) {
                if (delegate_map.has(key)) {
                    return delegate_map.get(key);
                } else if (typeof self[key] === "function") {
                    const method = self[key];
                    const delegate = ({
                        [key]: function(...args) {
                            // function expression does not capture the lexical "this"
                            // and hence "this" appeared in this function is not necessarily identical with ObservableObject itself.
                            
                            // to avoid crashing due to access private properties, 
                            // pass self as thisArg instead of proxy if the method invoked from proxy.
                            const result = method.apply(this === proxy ? self : this, args);

                            // recover reference to avoid exposing proxy target unexpectedly.
                            return result === self ? proxy : result;
                        }
                    })[key];
                    delegate_map.set(key, delegate);
                    return delegate;
                } else {
                    return self[key];
                }
            },
            set (self, key, value, _proxy) {
                if (!(key in self)) {
                    return false;
                } else if (self[key] === value) {
                    return true;
                } else if (!datatypes.has(key)) {
                    return false;
                } else if(typeof value !== datatypes.get(key)) {
                    return false;
                } else {
                    self[key] = value;
                    reflect(Object.freeze({ [key]: value }));
                    return true;
                }
            },
            defineProperty(self, key, desc) {
                if (!(key in self) || "set" in desc || "get" in desc) {
                    return false;
                } else if (!("value" in desc)) {
                    return Reflect.defineProperty(self, key, desc);
                } else {
                    const old_value = self[key];
                    const new_value = desc.value;
                    const succeeded = Reflect.defineProperty(self, key, desc);
                    if (succeeded) {
                        datatypes.set(key, typeof new_value);
                        if (!((key in self) && old_value === new_value)) {
                            reflect(Object.freeze({ [key]: new_value }));
                        }
                    }
                    return succeeded;
                }
            }
        });
        return this.#proxy;
    }

    curateValues() {
        const o = {};
        for (const k of this.#datatypes.keys()) {
            o[k] = this[k];
        }
        return o;
    }

    bindData(target, twoWay = this.allowsTwoWay) {

        if (target === null || typeof target !== "object") {
            Alier.Sys.loge(0, `${this.constructor.name}::${this.bindData.name}()`, `${target} is not a non-null object`);
            return false;
        } else if (typeof target.reflectValues !== "function") {
            Alier.Sys.loge(0, `${this.constructor.name}::${this.bindData.name}()`, `${target} does not have 'reflectValues()'`);
            return false;
        } else if (typeof target.onDataBinding !== "function") {
            Alier.Sys.loge(0, `${this.constructor.name}::${this.bindData.name}()`, `${target} does not have 'onDataBinding()'`);
            return false;
        } else if ("source" in target) {
            const bound_by_this = this.#connectors.has(target.source);
            Alier.Sys.loge(0, `${this.constructor.name}::${this.bindData.name}()`, bound_by_this ?
                "target is already bound with this source" :
                "target is already bound with other source"
            );
            return bound_by_this;
        }

        const connector = (this.allowsTwoWay && twoWay) ? 
            new TwoWayDataConnector(this.#proxy, target) :
            new OneWayDataConnector(this.#proxy, target)
        ;
        this.#connectors.add(connector);

        try {
            target.onDataBinding(connector);
            if (target.source !== connector) {
                throw new Error(".source property not set after invoking onDataBinding()");
            }
        } catch (e) {
            Alier.Sys.loge(0, `${this.constructor.name}::${this.bindData.name}()`,
                `${target.constructor?.name ?? "[null-prototype object]" }::onDataBinding() failed`,
                ` (reason: ${e.message}) `,
                e.stack
            );
            this.#connectors.delete(connector);
            return false;
        }

        try {
            target.reflectValues(this.curateValues());
        } catch (e) {
            Alier.Sys.loge(0, `${this.constructor.name}::${this.bindData.name}()`,
                `${target.constructor?.name ?? "[null-prototype object]" }::reflectValue() failed`,
                ` (reason: ${e.message}) `,
                e.stack
            );
            this.#connectors.delete(connector);
            return false;
        }
        return true;
    }

    reflectValues(valueMap) {
        const value_map = valueMap;
        const updated_values = Object.create(null);

        for (const k in value_map) {
            if (!Object.prototype.hasOwnProperty.call(value_map, k)) { continue; }
            if (!Object.prototype.hasOwnProperty.call(this, k)) { continue; }

            const target_value_equiv = _strto(value_map[k], this[k]?.constructor);
            if (this[k] !== target_value_equiv) {
                if (this.#datatypes.get(k) === typeof target_value_equiv) {
                    updated_values[k] = target_value_equiv;
                    // assign value to this directly because proxy traps set event and calls reflectValues().
                    this[k] = target_value_equiv;
                } else {
                    // notify type mismatched
                    updated_values[k] = this[k];
                }
            }
        }

        Object.freeze(updated_values);

        if (!isEmpty(updated_values)) {
            for (const connector of this.#connectors) {
                const target = connector.target.deref();
                if (target === undefined) {
                    this.#connectors.delete(connector);
                } else {
                    target.reflectValues(updated_values);
                }
            }
        }

        return updated_values;
    }
}

export { ObservableObject };
