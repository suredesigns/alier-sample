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

import { ObservableObject } from "/alier_sys/ObservableObject.js";

const validateIndex = (index, len, fallback) => {
    index = Number(index);
    if (Number.isNaN(index)) {
        return fallback;
    } else if (index < 0) {
        index = Math.max(0, index + len);
    } else if (index > len) {
        index = len;
    }
    if (!Number.isInteger(index)) {
        index = Math.floor(index);
    }
    return index;
}

const validateCount = (count, max, fallback) => {
    count = Number(count);
    if (Number.isNaN(count)) {
        return fallback;
    } else if (count < 0) {
        return 0;
    } else if (max >= 0 && count > max) {
        count = max;
    }
    if (!Number.isInteger(count)) {
        count = Math.floor(count);
    }
    return count;
}

/**
 * Makes a copy of the given object.
 * 
 * If a non-object value or null was given, just returns it.
 * Otherwise, creates a copy of the given object and returns the copy.
 * 
 * In addition, in the case of the frozen object was given,
 * just return the given object if either shallow copy is desired or the object has no object properties.
 * 
 * To copy the given object, this function uses its constructor.
 * Hence if the target object's constructor prohibits the use of the copy/conversion constructor
 * or it is simply lacking them, this function will not work as expected.
 * 
 * The returned object will have the same prototype and properties of the original object.
 * In addition, attributes of the properties, e.g. writable, configurable, enumerable, will also be conserved.
 * 
 * One of the exceptions is the case of applying to DOM Nodes.
 * This function has the same effect as {@link https://developer.mozilla.org/docs/Web/API/Node/cloneNode | Node.prototype.cloneNode} 
 * when applied to a Node object.
 * 
 * @param {*} x
 * an object to be cloned.
 * 
 * @param {boolean} deep
 * a boolean representing whether or not to create a deep copy.
 * This function returns a deep copy of the given object if `true` was given,
 * returns a shallow copy of the given object otherwise. 
 * 
 * @returns
 * a copy of the given value or object.
 * 
 * @throws {TypeError}
 * when `deep` was not a boolean.
 */
const clone = (x, deep = false) => {
    //  requires
    if (typeof deep !== "boolean") {
        throw new TypeError("'deep' must be a boolean");
    }

    //  do
    if (typeof x !== "object" || x === null || Object.isFrozen(x)) {
        return x;
    }
    if (Object.isFrozen(x)) {
        if (!deep) {
            return x;
        } else if (Object.values(x).every(v => typeof v !== "object" || v === null)) {
            return x;
        }
    }
    if ((x instanceof Date) || (x instanceof String) || (x instanceof Number) || (x instanceof Boolean)) {
        return new x.constructor(x.valueOf());
    } else if (Array.isArray(x)) {
        return deep ?
            x.map(y => clone(y, deep)) :
            [...x]
        ;
    } else if (typeof x[Symbol.iterator] === "function" || typeof x.length === "number") {
        return deep ? 
        new x.constructor(Array.from(x).map(y => clone(y, deep))) :
        new x.constructor(x)
    ;
    } else if (x instanceof Node) {
        return x.cloneNode(deep);
    } else {
        const copy = Object.create(Object.getPrototypeOf(x));
        const descriptors = Object.getOwnPropertyDescriptors(x);
        if (!deep) {
            return Object.defineProperties(copy, descriptors);
        } else {
            for (const [key, desc] of Object.entries(descriptors)) {
                if ("value" in desc) {
                    // Q.  Why cloning here?
                    // A.  It is needed for cloning before define property due to existence of non writable (i.e. read-only) properties.
                    //     Once you define a read-only property, you cannot replace it with its clone (w/o delete operation).
                    desc.value = clone(desc.value, deep);
                }
                Object.defineProperty(copy, key, desc);
            }
            return copy;
        }
    }
};

/**
 * Enumerator representing kinds of operations on `ObservableArray`.
 */
class OperationKind {
    static SORT   = new this("SORT");
    static SPLICE = new this("SPLICE");

    constructor(description) {
        this.description = typeof description === "string" ?
            description : ""
        ;
        Object.freeze(this);
    }
    toString() {
        return this.description;
    }
};
Object.freeze(OperationKind);

/**
 * A pseudo class which creates objects describing specific operation.
 */
class Operation extends null {
    constructor({ kind, startIndex, deleteCount, insertedItems, indexMap, from }) {
        if (!(kind instanceof OperationKind)) {
            throw new TypeError(
                `${kind} passed as 'kind' is not a valid operation kind`
            );
        }
        const self = Object.create(null);
        self.from = from;
        switch (kind) {
            case OperationKind.SORT: {
                if (indexMap === null || typeof indexMap !== "object") {
                    throw new TypeError(
                        `${indexMap} passed as 'indexMap' is not a non-null object`
                    );
                }
                if (typeof indexMap[Symbol.iterator] !== "function") {
                    throw new TypeError(
                        `${indexMap} passed as 'indexMap' is not an iterable`
                    );
                }
                indexMap = [...indexMap];
                for (const [i, v] of indexMap.entries()) {
                    if (v === null || typeof v !== "object") {
                        throw new TypeError(`${i}-th item of 'indexMap' is not a non-null object`);
                    } else if ((Array.isArray(v) && v.length !== 2) ||
                        (v.from === undefined && v.to === undefined)
                    ) {
                        throw new TypeError(
                            `${i}-th item of 'indexMap' is neither a 2-component array nor an object having 'to' and 'from' properties`
                        );
                    }
                    if (Array.isArray(v)) {
                        indexMap[i] = { from: Number(v[0]), to: Number(v[1]) };
                    } else {
                        v.from = Number(v.from);
                        v.to = Number(v.to);
                    }
                    if (Number.isNaN(indexMap[i].from) || Number.isNaN(indexMap[i].to)) {
                        throw new TypeError(
                            `${i}-th item of 'indexMap' contains a not-a-number`
                        );
                    }
                }
                for (const x of indexMap) {
                    Object.freeze(x);
                }
                Object.freeze(indexMap);
                Object.assign(self, { kind, indexMap });
                break;
            }
            case OperationKind.SPLICE: {
                if (startIndex === undefined) {
                    startIndex = Number.MAX_SAFE_INTEGER;
                }
                if (deleteCount === undefined) {
                    deleteCount = Number.MAX_SAFE_INTEGER;
                }
                if (insertedItems === undefined) {
                    insertedItems = [];
                }
                if (!Number.isSafeInteger(startIndex)) {
                    throw new TypeError(
                        `${startIndex} passed as 'startIndex' is not an integer.`
                    );
                } else if (!Number.isSafeInteger(deleteCount)) {
                    throw new TypeError(
                        `${deleteCount} passed as 'deleteCount' is not an integer.`
                    );
                } else if (!Array.isArray(insertedItems)) {
                    throw new TypeError(
                        `${insertedItems} passed as 'insertedItems' is not an array.`
                    );
                }
                insertedItems = Object.freeze([...insertedItems]);
                Object.assign(self, { kind, startIndex, deleteCount, insertedItems });
                break;
            }
            default:
                throw new TypeError(
                    `Unknown operation kind: ${kind}`
                );
        }
        return Object.freeze(self);
    }
}

/**
 * Gets a property descriptor of the target object or its prototypes.
 * 
 * Unlike `Object.getOwnPropertyDescriptor()`,
 * this function seeks the property in a prototype of the target object.
 * 
 * @param {object} target 
 * @param {string} key 
 * @returns {PropertyDescriptor | undefined}
 */
const getPropertyDescriptor = (target, key) => {
    // get own property descriptor of the given target
    let desc = Object.getOwnPropertyDescriptor(target, key);

    // loop until descriptor is not found
    for (let o = target; desc === undefined; desc = Object.getOwnPropertyDescriptor(o, key)) {
        o = Object.getPrototypeOf(o);
        //  Object.getOwnPropertyDescriptor() works only for non-null objects and functions,
        //  so break the loop if the prototype is null.
        //  (Object.getPrototypeOf() returns either null or an non-null object or a function).
        //
        //  Note that Object.getPrototypeOf(Object.prototype) will returns null and
        //  Object.getPrototypeOf(Function.prototype) will returns Object.prototype,
        //  so it is guaranteed that this loop stops in finite time.
        if (o === null) {
            break;
        }
    }
    return desc;
};

/**
 * A class for observing a sequential data.
 * 
 * Conceptually, an ObservableArray is a sequence of ObservableObjects of homogeneous data.
 */
class ObservableArray {
    //  put OperationKind as inner class of ObservableArray. 
    static OperationKind = OperationKind;

    /**
     * WeakMap which maps each of binding targets to its WeakRef.
     * @type {WeakMap<object, WeakRef>}
     */
    static #target_weakref_map = new WeakMap();

    /**
     * WeakMap which maps each of binding targets to its binding source.
     * @type {WeakMap<object, ObservableArray>}
     */
    static #target_source_map = new WeakMap();


    static isBound(target) {
        return ObservableArray.#target_source_map.has(target);
    }

    static sourceOf(target) {
        return ObservableArray.#target_source_map.get(target);
    }

    #archetype;
    #target_options = new Map();
    #length = 0;
    #proxy;
    #excluded_sync_targets = new Set();

    /**
     * A boolean representing whether or not to allow to reflect changes onto the source.
     * If this property is `true`, two-way binding is enabled, i.e. changes on binding targets is reflected onto the source. 
     * Otherwise, one-way binding is applied for every targets.
     * 
     * This property is not writable and not configurable.
     * The value of this is determined at construction.
     * 
     * @type {boolean}
     */
    twoWay = false;

    get length() {
        return this.#length;
    }

    set length(new_length) {
        new_length = Number(new_length);
        if (Number.isNaN(new_length)) {
            return;
        }
        if (this.length > new_length) {
            const delete_count = this.length - new_length;
            this.splice(this.length - delete_count, delete_count);
        } else if (this.length < new_length) {
            const insert_count = new_length - this.#length;
            this.splice(this.length, 0, insert_count);
        }
    }

    constructor(archetype, options) {
        //  apply default values
        const two_way    = options?.twoWay    ?? true;
        const init_count = options?.initCount ?? 0;

        //  requires 
        if (archetype === null || typeof archetype !== "object") {
            throw TypeError(`${archetype} is not a non-null object`);
        } else if (!Number.isSafeInteger(init_count)) {
            throw new TypeError("'initCount' must be a safe integer");
        } else if (typeof two_way !== "boolean") {
            throw new TypeError("'twoWay' must be a boolean");
        }

        //  do - initialization
        this.#archetype = clone(archetype, true);
        this.twoWay = two_way;
        Object.defineProperty(this, "twoWay", {
            writable    : false,
            configurable: false
        });
        if (init_count > 0) {
            this.push(init_count);
        }
        const prototype_keys = new Set(Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
        const delegate_map = new Map();
        this.#proxy = new Proxy(this, {
            set(self, key, value, proxy) {
                const desc = getPropertyDescriptor(self, key);
                if (desc === undefined) {
                    if (!Object.isExtensible(self)) {
                        return false;
                    }
                } else if (typeof desc.set === "function") {
                    self[key] = value;
                    return true;
                } else {
                    return Reflect.set(self, key, value, proxy);
                }
            },
            get(self, key, proxy) {
                const desc = getPropertyDescriptor(self, key);
                if (desc === undefined) {
                    return undefined;
                } else if (typeof desc.value === "function") {
                    if (!prototype_keys.has(key)) {
                        return Reflect.get(self, key, proxy);
                    } else if (delegate_map.has(key)) {
                        return delegate_map.get(key);
                    } else {
                        const method = desc.value;
                        const delegate = {
                            //  this'll be called as a method,
                            //  so this mustn't be arrow function because it doesn't have 'this' argument.
                            //  this function will have a name being the same as the value of 'key'.
                            [key]: function(...args) {
                                const result = method.apply(this === proxy ? self : this, args);
                                // this is just a cantrip. if result contains target but not itself, this won't work.
                                return result === self ? proxy : result;
                            }
                        }[key];
                        delegate_map.set(key, delegate);
                        return delegate;
                    }
                } else {
                    return self[key];
                }
            },
            deleteProperty(self, key) {
                if (typeof key === "string" && !Number.isNaN(Number(key))) {
                    return self.splice(Number(key), 1).length === 1;
                }
                return Reflect.deleteProperty(self, key);
            }
        });
        return this.#proxy;
    }

    /**
     * Makes an iterator of this array.
     * 
     * @returns iterator
     */
    [Symbol.iterator]() {
        return this.values();
    }

    /**
     * Binds the given object.
     * 
     * @param {object} target
     * a target object to be bound.
     * `target` must implement `syncComponents` method. 
     * 
     * @param {boolean} twoWay 
     * a flag indicating whether or not the given target is to be two-way bound.
     * 
     * By default, this parameter inherits the value of the target `ObservableArray`'s `twoWay` property.
     * 
     * @returns {boolean}
     * `true` if the given target is successfully bound, or it was already bound,
     * `false` otherwise.
     * In addition, if this array itself allows only one-way binding,
     * this method returns `false` when two-way binding has been required.
     * 
     * @throws {TypeError}
     * when the given target is not a non-null object.
     * 
     * @throws {TypeError}
     * when the given target did not implement `syncComponents()` method.
     * 
     * @throws {Error}
     * when `syncComponents()` was failed on the initial synchronization.
     */
    bindData(target, twoWay) {
        // requires
        if (target === null || typeof target !== "object") {
            throw new TypeError(`${target} is not a non-null object`);
        } else if (typeof target.syncComponents !== "function") {
            throw new TypeError(`${target} does not implement 'syncComponents' function`);
        } else if (typeof target.onDataBinding !== "function") {
            throw new TypeError(`${target} does not implement 'onDataBinding' function`);
        } else if (twoWay !== undefined && typeof twoWay !== "boolean") {
            throw new TypeError(`${twoWay} is not a boolean`);
        }

        // do
        // do - set default arguments
        const two_way = twoWay ?? this.twoWay;

        // do - early return if possible
        if (this.#is(target)) {
            // self-binding is not allowed
            return false;
        } else if (!this.twoWay && two_way) {
            // to bind a target in two-way with one-way binding source is not allowed
            return false;
        } else if (ObservableArray.isBound(target)) {
            // return if the given target is already bound with some source.
            return this.#is(ObservableArray.sourceOf(target));
        }

        // do - add new reference
        const wref = new WeakRef(target);
        this.#target_options.set(wref, { twoWay: two_way });
        ObservableArray.#target_weakref_map.set(target, wref);
        ObservableArray.#target_source_map.set(target, this.#proxy);

        // do - notify binding
        try {
            target.onDataBinding(this.#proxy);
        } catch(e) {
            // do - restore state and report error
            this.#target_options.delete(wref);
            ObservableArray.#target_weakref_map.delete(target);
            ObservableArray.#target_source_map.delete(target);
            throw new Error(`'onDataBinding' was failed at initial binding (reason: ${e.message})`, { cause: e });
        }

        // do - sync
        try {
            target.syncComponents(new Operation({
                from         : this.#proxy,
                kind         : OperationKind.SPLICE,
                startIndex   : 0,
                deleteCount  : Number.MAX_SAFE_INTEGER,
                insertedItems: [...this]
            }));
        } catch(e) {
            // do - restore state and report error
            this.#target_options.delete(wref);
            ObservableArray.#target_weakref_map.delete(target);
            ObservableArray.#target_source_map.delete(target);
            throw new Error(`'syncComponents' was failed at initial binding (reason: ${e.message})`, { cause: e });
        }

        return true;
    }

    /**
     * unbinds the given object if it is bound by this.
     * 
     * @param {object} target
     * an object to be unbound if it has been bound.
     * @returns {boolean}
     * `true` if the given object is successfully unbound, `false` otherwise. 
     */
    unbind(target) {
        // do - early returning if possible
        if (target === null || typeof target !== "object") {
            return false;
        } else if (!ObservableArray.#target_weakref_map.has(target)) {
            return false;
        }
        // do - delete a reference if exists
        const wref = ObservableArray.#target_weakref_map.get(target);
        if (!this.#target_options.has(wref)) {
            return false;
        }
        this.#target_options.delete(wref);
        ObservableArray.#target_weakref_map.delete(target);
        ObservableArray.#target_source_map.delete(target);
        return true;
    }

    /**
     * 
     * @param {(
     *  {
     *      from         : object,
     *      kind         : OperationKind,
     *      indexMap     : { from: number, to: number }[]?,
     *      startIndex   : number?,
     *      deleteCount  : number?,
     *      insertedItems: object[]?
     *  }
     * )} operation 
     * an object representing a certain operation to array.
     * 
     * `kind` represents a kind of the given operation.
     * `OperationKind.SORT` or `OperationKind.SPLICE` are possible. 
     * 
     * `indexMap` is defined only when kind === OperationKind.SORT.
     * `indexMap` contains an array of pairs of indices.
     * 
     * @param {OperationKind} operation.kind
     * a value representing a kind of the given operation.
     * `OperationKind.SORT` or `OperationKind.SPLICE` are possible. 
     * @throws {TypeError} when the given `operation`'s kind is unknown.
     */
    syncComponents(operation) {
        if (this.#is(operation.from) || !this.#is(ObservableArray.sourceOf(operation.from))) {
            return;
        }
        switch (operation.kind) {
            case OperationKind.SORT: {
                const items = [...this.values()];
                for (const { from, to } of operation.indexMap) {
                    Object.defineProperty(this, String(to), { value: items[from] });
                }
                break;
            }
            case OperationKind.SPLICE: {
                this.#excluded_sync_targets.add(operation.from);
                const two_way        = this.#target_options.get(ObservableArray.#target_weakref_map.get(operation.from)).twoWay;
                const inserted_items = operation.insertedItems;
                const start_index    = operation.startIndex;
                this.splice(start_index, operation.deleteCount, inserted_items.length);
                for (const [index, item] of inserted_items.entries()) {
                    this[start_index + index].bindData(item, two_way);
                }
                this.#excluded_sync_targets.delete(operation.from);
                break;
            }
            default:
                throw new TypeError(`"${operation.kind.description}" is unknown operation`);
        }
    }

    /**
     * A callback function invoked when this object is bound by some binding source.
     * 
     * @param {object} source 
     * source object which binds this.
     */
    onDataBinding(source) {
        if (source === null || typeof source !== "object") {
            throw new TypeError(`${source} is not a non-null object`);
        } else if (typeof source.syncComponents !== "function") {
            throw new TypeError(`${source} does not implement 'syncComponents' function`);
        } else if (ObservableArray.sourceOf(this.#proxy) !== source) {
            throw new TypeError(`this object is not bound by ${source}`);
        }
    }

    /**
     * Gets the component with the given index.
     * 
     * @param {number|string} index 
     * index of target component.
     * If `index` is negative, then add the array length to it.
     * @returns {object|undefined} target component if it exists, `undefined` otherwise.
     */
    at(index) {
        if (!(typeof index === "symbol" || Number.isNaN(Number(index)))) {
            index = Number(index);
        }
        if (!Number.isSafeInteger(index) || index < -this.length || this.length <= index) {
            return undefined;
        }
        return index < 0 ? this[index + this.length] : this[index];
    }

    /**
     * Applies the given reducer function for each components of this array and return the last result.
     * The index runs from the first (left) to the last (right) while this operation.
     * 
     * @param {(initialValue: any, value: object, index: number, self: this) => any} reducer 
     * callback function of reduction.
     * the first argument `initialValue` represents the initial value for the reduction for the first call,
     * and the previous return value of the callback.
     * the second argument `value` represents the value of the current component.
     * the third argument `index` represents the index of the current component.
     * the fourth argument `self` represents this array itself.
     * 
     * @param {any} initialValue 
     * initial value of reduction.
     * it is used as the first argument of the given reducer function for the first call.
     * 
     * If this was not given, the first component of this array will be used as `initialValue` instead.
     * In this case, the reducer will only be applied the rest components of this array,
     * i.e. reducer will not be applied to the first component.
     * 
     * @returns the last result of `reducer` function.
     */
    reduce(reducer, initialValue) {
        let index = 0;
        let last_result = arguments.length < 2 ? this[index++] : initialValue;

        // cache array length to emulate behavior of iterative methods,
        // iterative methods does not run extra indices even if some components added during iteration.
        const end = this.length;
        for (; index < end; index++) {
            //  skip empty slot
            //  it may happen because reducer can delete multiple components at once by calling splice().
            if (!(index in this)) { continue; }

            last_result = reducer(last_result, this[index], index, this.#proxy);
        }

        return last_result;
    }

    /**
     * Applies the given reducer function for each components of this array and return the last result.
     * The index runs from the last (right) to the first (left) while this operation.
     * 
     * @param {(initialValue: any, value: object, index: number, self: this) => any} reducer 
     * callback function of reduction.
     * the first argument `initialValue` represents the initial value for the reduction for the first call,
     * and the previous return value of the callback.
     * the second argument `value` represents the value of the current component.
     * the third argument `index` represents the index of the current component.
     * the fourth argument `self` represents this array itself.
     * 
     * @param {any} initialValue 
     * initial value of reduction.
     * it is used as the first argument of the given reducer function for the first call.
     * 
     * If this was not given, the last component of this array will be used as `initialValue` instead.
     * In this case, the reducer will only be applied the rest components of this array,
     * i.e. reducer will not be applied to the last component.
     * 
     * @returns the last result of `reducer` function.
     */
    reduceRight(reducer, initialValue) {
        let index = this.length - 1;

        if (arguments.length < 2) { // initialValue not provided
            initialValue = this[index--];
        }

        for (; index >= 0; index--) {
            //  skip empty slot
            //  it may happen because reducer can delete multiple components at once by calling splice().
            if (!(index in this)) { continue; }

            initialValue = reducer(initialValue, this[index], index, this.#proxy);
        }

        return initialValue;
    }

    /**
     * Maps each components to some values.
     * 
     * @param {(value: any, index: number, self: this) => any} callback 
     * the callback function which is applied to each components of this array.
     * 
     * @param {*} thisArg 
     * the this argument used for the given callback.
     * 
     * @returns {any[]} an array of the results of the given callback.
     * Unlike filter, this function always returns an array having the same length as the target ObservableArray.
     */
    map(callback, thisArg) {
        return this.reduce((last_result, value, index, self) => {
            const mapped_value = callback.call(thisArg, value, index, self);

            last_result[index] = mapped_value;

            return last_result;
        }, new Array(this.length));
    }

    /**
     * Filters each components.
     * 
     * @param {(value: any, index: number, self: this) => any} predicate 
     * the predicate function which test each components satisfies the given condition.
     * 
     * @param {*} thisArg 
     * the this argument used for the given predicate function.
     * 
     * @returns {any[]} an array of the components which satisfy the given condition.
     */
    filter(predicate, thisArg) {
        return this.reduce((result, value, index, self) => {
            const passed = predicate.call(thisArg, value, index, self);

            if (passed) {
                result.push(value);
            }

            return result;
        }, []);
    }

    /**
     * Tests whether every components satisfies the given condition or not.
     * 
     * @param {(value: any, index: number, self: this) => any} predicate 
     * the predicate function which test each components satisfies the given condition.
     * 
     * @param {object} thisArg 
     * the this argument used for the given predicate function.
     * 
     * @returns {boolean}
     * `true` if every components satisfies the given condition, `false` otherwise.
     * If this array is empty, this function always returns `true`.
     */
    every(predicate, thisArg) {
        // cache array length to emulate behavior of iterative methods,
        // iterative methods does not run extra indices even if some components added during iteration.
        const end = this.length;
        for (let index = 0; index < end; index++) {
            //  skip empty slot
            //  it may happen because reducer can delete multiple components at once by calling splice().
            if (!(index in this)) { continue; }

            const passed = predicate.call(thisArg, this[index], index, this.#proxy);

            if (!passed) {
                return false;
            }
        }
        return true;
    }

    /**
     * Tests whether some of the components satisfies the given condition or not.
     * 
     * @param {(value: any, index: number, self: this) => any} predicate 
     * the predicate function which test each components satisfies the given condition.
     * 
     * @param {object} thisArg 
     * the this argument used for the given predicate function.
     * 
     * @returns {boolean}
     * `true` if some of the components satisfies the given condition, `false` otherwise.
     * If this array is empty, this function always returns `false`.
     */
    some(predicate, thisArg) {
        // NOTE: some(predicate) is logically equivalent to negation of every(counter_predicate) (see below),
        //
        //         some(p)       every(p)      every(not p)   not every(not p)  <==>  some(p)
        //         [T, T] -> T   [T, T] -> T   [F, F] -> F    [F, F] -> T
        //         [T, F] -> T   [T, F] -> F   [F, T] -> F    [F, T] -> T
        //         [F, F] -> F   [F, F] -> F   [T, T] -> T    [T, T] -> F
        //         []     -> F   []     -> T   []     -> T    []     -> F
        //
        //         (here [...] represents a sequence of predicate results and
        //          T and F means "true" and "false" respectively).
        //       
        //       but to keep symmetry and to avoid overhead of creation of anonymous function,
        //       some() and every() are independently implemented.

        // cache array length to emulate behavior of iterative methods,
        // iterative methods does not run extra indices even if some components added during iteration.
        const end = this.length;
        for (let index = 0; index < end; index++) {
            //  skip empty slot
            //  it may happen because reducer can delete multiple components at once by calling splice().
            if (!(index in this)) { continue; }
            const passed = predicate.call(thisArg, this[index], index, this.#proxy);
            if (passed) {
                return true;
            }
        }
        return false;
    }

    /**
     * Gets a key iterator.
     * 
     * @returns  a key iterator for this array. 
     */
    *keys() {
        for (let index = 0; index < this.#length; index++) {
            yield index;
        }
    }

    /**
     * Gets a value iterator.
     * 
     * @returns a value iterator for this array. 
     */
    *values() {
        for (let index = 0; index < this.#length; index++) {
            yield this[index];
        }
    }

    /**
     * Gets an entry iterator.
     * 
     * @returns an entry iterator for this array. 
     */
    *entries() {
        for (let index = 0; index < this.#length; index++) {
            yield [index, this[index]];
        }
    }

    /**
     * Reverses the order of components.
     * 
     * This function will invoke `syncComponents()` method of the binding targets. 
     */
    reverse() {
        // do
        const indexMap = [];
        for (let from = 0, to = this.length - 1; from < to; from++, to--) {
            indexMap.push({ from: from, to: to }, { from: to, to: from });
            const from_value = this[from];
            const to_value   = this[to];
            Object.defineProperty(this, String(from), { value: to_value });
            Object.defineProperty(this, String(to), { value: from_value });
        }
        this.#sync(new Operation({
            from    : this.#proxy,
            kind    : OperationKind.SORT,
            indexMap: indexMap
        }));
        return this.#proxy;
    }

    /**
     * Sorts the order of components with the given comparator.
     * 
     * This function will invoke `syncComponents()` method of the binding targets. 
     * 
     * @param {((x: any, y: any) => number)?} compare
     * a function determining the order of the components.
     * 
     * If the left term is "less than" the right term in a certain sense, this function should return a negative value. 
     * If the left term is "greater than" the right term in a certain sense, this function should return a positive value. 
     * This function should return zero otherwise.
     * 
     * If the comparator function was not provided, then this function uses the default comparator.
     * The default comparator compares each properties of the given objects in the defined order.
     * e.g., `default_compare({x: 1, y: 2}, {x: 2, y: 1})` will return a negative value.
     */
    sort(compare) {
        // do
        if (typeof compare !== "function") {
            const comp_primitive = (x, y) => (
                  (x == null || Number.isNaN(x) || x > y)
                - (y == null || Number.isNaN(y) || x < y)
            );
            compare = (x, y) => {
                const xlist = [x], ylist = [y];
                while (xlist.length > 0 && ylist.length > 0) {
                    const xi = xlist.shift();
                    const yi = ylist.shift();
                    if (typeof xi !== typeof yi  ||
                        typeof xi === "symbol"   ||
                        typeof xi === "function" ||
                        xi == null ||
                        yi == null
                    ) {
                        continue;
                    } else if (typeof xi !== "object") {
                        const result = comp_primitive(xi, yi);
                        if (result === 0) {
                            continue;
                        } else {
                            return result;
                        }
                    } else {
                        const keys = [...new Set([...Object.keys(xi), ...Object.keys(yi)].reverse())];
                        for (const k of keys) {
                            xlist.unshift(xi[k]);
                            ylist.unshift(yi[k]);
                        }
                    }
                }
                return 0;
            };
        }
        // do - get indices of sorted array
        const sorted_indexed_items = [...this.entries()]
            .sort(([, x], [, y]) => compare(x, y))  //  sort by values using 'compare' function
        ;
        // do - apply sort result and sync
        const indexMap = [];
        for (const [to, [from, item]] of sorted_indexed_items.entries()) {
            if (to === from) {
                continue;
            }
            indexMap.push({ from: from, to: to });
            Object.defineProperty(this, String(to), { value: item });
        }
        this.#sync(new Operation({
            from    : this.#proxy,
            kind    : OperationKind.SORT,
            indexMap: indexMap
        }));

        return this.#proxy;
    }

    /**
     * Appends items at the end of this array.
     * 
     * Unlike `Array.prototype.push()` this method requires a number of items to be appended
     * instead of a list of items.
     * 
     * @param {number} insertCount
     * a number of items to be inserted at the end of this array. 
     * 
     * @returns
     * new length of this array.
     * 
     * @throws {TypeError}
     * when the given `insertCount` was not a safe integer.
     */
    push(insertCount = 1) {
        this.splice(this.length, 0, insertCount);
        return this.length;
    }

    /**
     * Removes the last item from an array and returns it.
     * If the array is empty, this does nothing.
     */
    pop() {
        const [last_item] = this.splice(this.length - 1, 1);
        return last_item;
    }

    /**
     * Appends items at the beginning of this array.
     * 
     * Unlike `Array.prototype.unshift()` this method requires a number of items to be appended
     * instead of a list of items.
     * 
     * @param {number} insertCount
     * a number of items to be inserted at the beginning of this array. 
     * 
     * @returns
     * new length of this array.
     * 
     * @throws {TypeError}
     * when the given `insertCount` was not a safe integer.
     * 
     * @throws {RangeError}
     * when the given `insertCount` was negative.
     */
    unshift(insertCount = 1) {
        this.splice(0, 0, insertCount);
        return this.length;
    }

    /**
     * Removes the first item of an array and returns it.
     * If the array is empty, this does nothing.
     */
    shift() {
        const [first_item] = this.splice(0, 1);
        return first_item;
    }

    #move(from, to) {
        //  do
        const old_len = this.#length;
        let result = null;
        if (from < to) {
            let i = old_len - 1;
            let j = old_len - 1 + (to - from);
            for (; j >= to; i--, j--) {
                // j : ((old_len - 1) + to - from) -> to
                // i :  (old_len - 1)              -> from
                Object.defineProperty(this, String(j), {
                    enumerable  : true,
                    writable    : false,
                    configurable: true,
                    value: this[i]
                });
            }
            for (; j >= from; j--) {
                delete this[j];
            }
        } else if (from > to) {
            const move_dist     = from - to;
            const rest_len      = old_len - from;
            const removed_items = new Array(move_dist);
            if (move_dist <= rest_len) {
                //  rest_len = 3 >  move_dist = 1
                //      [o] [o] [o] [o] [o] [d] [m] [m] [m]
                //  --> [o] [o] [o] [o] [o] [m] [m] [m]  x
                //  rest_len = 3 == move_dist = 3
                //      [o] [o] [o] [d] [d] [d] [m] [m] [m]
                //  --> [o] [o] [o] [m] [m] [m]  x   x   x
                let i = from, j = to;
                for (let buff_index = 0; j < from; i++, j++, buff_index++) {
                    removed_items[buff_index] = this[j];
                    Object.defineProperty(this, String(j), {
                        value       : this[i]
                    });
                }
                for (; j < old_len - move_dist; i++, j++) {
                    Object.defineProperty(this, String(j), {
                        value       : this[i]
                    });
                }
                for (; j < old_len; j++) {
                    delete this[j];
                }
            } else {
                //  rest_len = 3 <  move_dist = 5
                //      [o] [d] [d] [d] [d] [d] [m] [m] [m]
                //  --> [o] [m] [m] [m]  x   x   x   x   x
                //  rest_len = 1,  move_dist = 3
                //      [d] [d] [d] [m]
                //  --> [m]  x   x   x 
                let i = from, j = to;
                let buff_index = 0;
                for (; j < to + rest_len; i++, j++, buff_index++) {
                    removed_items[buff_index] = this[j];
                    Object.defineProperty(this, String(j), {
                        value       : this[i]
                    });
                }
                for (; j < from; i++, j++, buff_index++) {
                    removed_items[buff_index] = this[j];
                    delete this[j];
                }
                for (; j < old_len; j++) {
                    delete this[j];
                }
            }
            result = removed_items;
        }
        return result;
    }
    /**
     * Remove items from the specified position and then insert items into there.
     * 
     * Unlike `Array.prototype.splice()` this method requires a number of items to be inserted
     * instead of a list of items.
     * 
     * @param {number} startIndex
     * a number representing the position of items to be removed and where the items are to be inserted.
     * @param {number} deleteCount
     * a number of items to be removed from this array. 
     * @param {number} insertCount
     * a number of items to be inserted at the beginning of this array. 
     * 
     * @returns
     * new length of this array.
     */
    splice(startIndex, deleteCount, insertCount = 0) {
        // requires
        // requires - cache previous length of this array
        const old_len = this.length;

        // requires - convert each of parameters to its appropriate form
        //   'startIndex' should always satisfy the following condition:
        //        (0 <= startIndex)  AND  (startIndex <= old_len)  AND  isInteger(startIndex)
        //   'deleteCount' should always satisfy the following condition:
        //        (0 <= deleteCount)  AND  (startIndex + deleteCount <= old_len)  AND  isInteger(startIndex)
        //   'insertCount' should always satisfy the following condition:
        //        (0 <= insertCount)  AND  isInteger(startIndex)
        const start_index  = validateIndex(startIndex, old_len, 0);
        const delete_count = validateCount(deleteCount, old_len - start_index, 0);
        const insert_count = validateCount(insertCount, -1, 0);
        // requires - test extensibility
        if (insert_count > delete_count && !Object.isExtensible(this)) {
            throw new TypeError("Cannot define property to non-extensible object");
        }

        // do
        // redefine the given parameters as constants for simplicity.
        // do - delete and insert items
        const deleted_items  = new Array(delete_count);
        const inserted_items = new Array(insert_count);
        const delete_end = start_index + delete_count;
        const insert_end = start_index + insert_count;

        if (insert_count === delete_count) {
            for (let i = start_index, j = 0; i < insert_end; i++, j++) {
                const oo = this.#makeObservableObject();
                const deleted_item = this[i];
                deleted_items[j]  = deleted_item;
                inserted_items[j] = oo;
                Object.defineProperty(this, String(i), {
                    value: oo
                });
            }
        } else {
            const removed_items = this.#move(delete_end, insert_end);

            if (insert_count < delete_count) {
                let j = 0;
                for (let i = start_index; j < insert_count; i++, j++) {
                    const oo = this.#makeObservableObject();
                    deleted_items[j]  = this[i];
                    inserted_items[j] = oo;
                    Object.defineProperty(this, String(i), {
                        value: oo
                    });
                }
                for (let i = 0; j < delete_count; i++, j++) {
                    deleted_items[j] = removed_items[i];
                }
            } else {  //  insert_count > delete_count
                let i = start_index;
                let j = 0;
                for (; j < delete_count; i++, j++) {
                    const oo = this.#makeObservableObject();
                    deleted_items[j]  = this[i];
                    inserted_items[j] = oo;
                    Object.defineProperty(this, String(i), {
                        value: oo
                    });
                }
                for (; j < insert_count; i++, j++) {
                    const oo = this.#makeObservableObject();
                    inserted_items[j] = oo;
                    Object.defineProperty(this, String(i), {
                        enumerable  : true,
                        writable    : false,
                        configurable: true,
                        value       : oo
                    });
                }
            }
        }

        //  do - sync
        this.#sync(new Operation({
            from         : this.#proxy,
            kind         : OperationKind.SPLICE,
            startIndex   : start_index,
            deleteCount  : deleted_items.length,
            insertedItems: inserted_items
        }));

        // do - update length
        //  code above here will throw exceptions, so to prevent to introduce inconsistency,
        //  update is done lastly.
        this.#length = old_len - delete_count + insert_count;

        return deleted_items;
    }

    #sync(operation) {
        if (operation.from === this) {
            Alier.Sys.loge(0, "'this' object exposed!");
        }
        const errors = [];
        for (const [wref, options] of this.#target_options) {
            const target = wref.deref();
            if (target === undefined) {
                this.#target_options.delete(wref);
                continue;
            } else if (this.#excluded_sync_targets.has(target)) {
                continue;
            }
            try {
                if (!options.twoWay) {
                    target.syncComponents(new Operation({
                        from         : this.#proxy,
                        kind         : OperationKind.SPLICE,
                        startIndex   : 0,
                        deleteCount  : Number.MAX_SAFE_INTEGER,
                        insertedItems: [...this]
                    }));
                } else {
                    target.syncComponents(operation);
                }
            } catch(e) {
                Alier.Sys.loge(`${target.constructor?.name}`);
                errors.push(e);
            }
        }
        if (errors.length > 0) {
            throw new AggregateError(errors, "sync error");
        }
    }

    #makeObservableObject() {
        const src = clone(this.#archetype, true);
        return new ObservableObject(src, this.twoWay);
    }

    #is(o) {
        return this === o || this.#proxy === o;
    }
}

Object.defineProperty(
    ObservableArray,
    OperationKind.name,
    { configurable: false, writable: false, enumerable: true }
);

export {
    ObservableArray,
    ObservableObject
};
