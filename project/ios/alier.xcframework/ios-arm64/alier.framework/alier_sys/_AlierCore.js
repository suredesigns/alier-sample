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
 * Definition of constants intended to be used in the global scope.
 */

const LogLevel = Object.freeze({
    DEBUG : 0,
    INFO  : 1,
    WARN  : 2,
    ERROR : 3,
    FAULT : 4
});

const LogFilterConfig = Object.seal({
    minLogLevel: LogLevel.DEBUG,
    startId    : 0,
    endId      : Number.MAX_SAFE_INTEGER
});

// THIS SCRIPT WILL BE EVALUATED AS CLASSIC SCRIPT.
// If you want to define something, you SHOULD wrap it into the below IIFE for avoiding to pollute the namespace.
// "constant" intended to be used in global scope is an exception.
/**
 * A brief description of the start-up sequence.
 * 
 * The start-up sequence is divided to four parts, Phase 1, Phase 2, Phase 3, and Phase 4.
 * The odd numbered phases are done by native side and the even numbered ones are done by JS side.
 * 
 * Entire of the start-up sequence is starting and finishing during a lifecycle event such as onCreate() on Android.
 * 
 * In every phase, a phase owner will start the next phase by sending a notification
 * and, for keeping simplicity, will do no extra work at all except the last phase.
 * 
 * In Phase 1, this is done by the native side, the framework:
 * -  creates a WebView
 * -  and then, loads _AlierCore.js (i.e. this script) on it.
 * 
 * In Phase 2, this is done by the JS side, the framework:
 * -  registers a function to register a JS function onto the function map used by the native side
 * 
 * In Phase 3, this is done by the native side, the framework:
 * -  registers a bunch of native functions onto the function map used by the JS side
 * -  and then, registers system environment variables
 * and then the user app:
 * -  app registers its own native functions
 * -  and then, registers additional environment variables
 *  
 * In Phase 4. this is done by the JS side, the framework:
 * -  gets environment variables registered at Phase 3
 * -  and then, import the main script ("main.js")
 * -  and then, run the entry-point function ("main()" function) defined imported from the main script
 * 
 * At the last step of the Phase 4, before executing the main() function,
 * the framework notifies to the native side that the start-up sequence is complete.
 * This is important because the native side will waste time
 * if the notification wasn't sent until the main() function returned the control.
 */
(async () => {
"use strict";

//  ---- BEGIN: script part ---
const Alier = await _initAlier();
{
    Alier.Sys._registerNativeFunction("registerFunction");
    Alier.Sys._sendstat("FUNCTION_REGISTRATION_AVAILABLE");
}

await Alier.Sys._wait("FUNCTION_REGISTRATION_COMPLETE");
{
    await new Promise(resolve => {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", resolve, { once: true, passive: true });
        } else {
            resolve();
        }
    });
    //  Import the main script. 
    //  Note that, to work import/export mechanism properly, globalThis.Alier is defined before the import.
    const { default: main, ...rest } = await import(new URL("./main.js", document.baseURI).pathname);
    if (typeof main !== "function") {
        throw new SyntaxError("main() function is not defined as a function.");
    }
    //  Expanding the main module features on global scope except main() function.
    //  This will allow the users to use the features they defined without importing.
    //  Such behaviour is unnecessary in essentials but it is supposed to be convenient for the most cases. 
    Object.assign(globalThis, rest);

    //Enables push notification events to be notified
    Alier.Native.setSystemEventListener("notified", (param) => {
        const message = Alier.message(param.id, param.code, param.param, param.origin)
        Alier.SysEvent.post(message);
    });
    //Enabling notification of lifecycle events
    Alier.Native.setSystemEventListener("lifeCycle", (param) => {
        Alier.Sys.logd(0, "[lifecycle event]", param);
        const message = Alier.message(param.id, param.code, param.param, param.origin)
        Alier.SysEvent.post(message);
    });
    Alier.Native.setSystemEventListener("hardware", (param) => {
        Alier.Sys.logd(0, "[hardware event]", param);
        const message = Alier.message(param.id, param.code, param.param, param.origin)
        Alier.SysController.post(message);
    });
    const log_filter = Alier.Native.getLogFilter();
    const [ minLogLevel, startId, endId ] = log_filter.split(",").map(Number);

    Alier.Sys.logFilter(minLogLevel, startId, endId);

    // Get startup parameters
    const startup_params = Alier.Native.getStartupParams();

    queueMicrotask(async () => {
        const AsyncFunction          = (async function(){}).constructor;
        const GeneratorFunction      = (function*(){}).constructor;
        const AsyncGeneratorFunction = (async function*(){}).constructor;
        
        switch (main.constructor) {
            case AsyncFunction: {
                await main(startup_params);
            }
            break;
            case AsyncGeneratorFunction: {
                for await (const _ of main(startup_params)) {
                    /* Intentionally do nothing here */
                }
            }
            break;
            case GeneratorFunction: {
                for (const _ of main(startup_params)) {
                    /* Intentionally do nothing here */
                }
            }
            break;
            default:
                main(startup_params);
        }

        Alier.Sys._sendstat("MAIN_FUNCTION_COMPLETE");
    });

    Alier.Sys._sendstat("PROLOGUE_COMPLETE");
}
    
//  ---- END  : script part ---

//  ---- BEGIN: function declarations ----
//  Function declarations are hoisted to the top of the current function scope.
//  This style may surprise you because it seems that functions called before they are defined at the first glance,
//  but it works.
//  Note that this trick depends on the hoisting mechanism of the function declaration statement.
//  So you shan't define a function with a combination of variable declaration statement and
//  a function expression as an initial value.
//  Variables declared via the "var" statement are defined at the top of the current function scope
//  but their initial values are not hoisted.
//  Variables declared via the "let/const" statement are defined at the top of the current
//  block scope (not the function one) and
//  they cannot be accessed until they are initialized (i.e. reaching at the variable declaration line).
//  In addition, a class declaration statement is not hoisted as the same manner as a function declaration.
//  So, if you want to add some class definitions or constants you should write them in function declarations and
//  call these wrappers.
async function _initAlier() {
    const Alier = new class __Alier__ {
        static #initialized = false;

        /** @type {Map<string, string>} */
        static #env_map = new Map();

        constructor() {
            if (__Alier__.#initialized) {
                throw new Error("Instantiation prohibited.");
            }
            __Alier__.#initialized = true;
        }
        
        async fetch(requestOrUrl, options) {
            const request = { method: "GET", url: "", headers: null, body: null };

            if (requestOrUrl instanceof Request) {
                const body_     = (requestOrUrl.body != null) ?
                    Alier.Sys.encodeBase64String(await requestOrUrl.arrayBuffer(), false) :
                    null
                ;
                const headers_  = Object.fromEntries(requestOrUrl.headers.entries());

                request.url     = requestOrUrl.url;
                request.method  = requestOrUrl.method;
                request.headers = headers_;
                request.body    = body_;
            } else if ((requestOrUrl instanceof URL) || typeof requestOrUrl === "string") {

                const   url_    = (typeof requestOrUrl !== "string") ? requestOrUrl.toString() : requestOrUrl;

                const   method  = options?.method  ?? "GET",
                        headers = options?.headers ?? null,
                        body    = options?.body    ?? null
                ;

                if (typeof method !== "string") {
                    throw new TypeError(`${method} is not a string`);
                } else if (!(headers == null || typeof headers === "object")) {
                    throw new TypeError(`${headers} is not an object or a null`);
                }

                const method_   = method.toUpperCase();
                const headers_  = (headers instanceof Headers) ? Object.fromEntries(headers.entries()) : (headers ?? {});
                const body_     = (typeof body !== "string" && body != null) ? Alier.Sys.encodeBase64String(body, false) : body;

                request.url     = url_;
                request.method  = method_;
                request.headers = headers_;
                request.body    = body_;
            } else {
                throw new TypeError(`${requestOrUrl} is neither a Request nor a string nor an URL`);
            }

            const response = await Alier.Native.fetch(request);
            
            let { status, statusText, body, headers } = response;           
            if (status === 204 || status === 304) {
                //  Response.constructor will throws an error when a non-null body was given with status 204/304 which does not allow to have a body.
                //  Note that 204 means "No Content" and 304 means "Not Modified".
                body = null;
            } else if (typeof body === "string" && body.startsWith("data:")) {
                const { data, type, charset } = Alier.Sys.decodeDataUrl(body);
                headers["content-type"] = `${type}; charset="${charset}"`;
                body = data;
            }

            return new Response(body, { status: status, statusText: statusText, headers: headers });
        }

        setEnv(key, value) {
            if (typeof key !== "string" || typeof value !== "string") {
                throw new TypeError(`${key} or ${value} is not a string`);
            }
            __Alier__.#env_map.set(key, value);
        }
        getEnv(key) {
            if (typeof key !== "string") {
                throw new TypeError(`${key} is not a string`);
            }
            return __Alier__.#env_map.get(key);
        }

        /**
         * Creates a message object.
         * 
         * @param {string} id
         * A string representing the primary identifier of the message to create.
         * 
         * @param {string} code
         * A string representing the secondary identifier of the message to create.
         * 
         * @param {any} param
         * Additional parameter bound with the message to create.
         * 
         * @param {any} origin
         * The origin of the message to create.
         * 
         * @returns {({
         *      id: string,
         *      code: string,
         *      param: any,
         *      origin: any
         * })}
         * A message object.
         */
        message(id, code, param, origin) {
            return Object.defineProperties(Object.create(null), {
                id: {
                    enumerable  : true,
                    writable    : false,
                    configurable: false,
                    value       : id
                },
                code: {
                    enumerable  : true,
                    writable    : false,
                    configurable: false,
                    value       : code
                },
                param: {
                    enumerable  : true,
                    writable    : false,
                    configurable: false,
                    value       : param
                },
                origin: {
                    enumerable  : true,
                    writable    : false,
                    configurable: false,
                    value       : origin ?? null
                },
            });
        }
    };
    
    Object.defineProperty(globalThis, "Alier", {
        value         : Alier,
        enumerable    : true,
        writable      : false,
        configurable  : false
    });
    
    {
        /**
         * Delegates an asynchronous function invocation to the JavaScript interface on the native land.
         * 
         * The implementation of this function depends on the platform on which the application runs.
         * 
         * @param {string} function_name
         * @param {({id: string, name: string, type: string})} callback_handle
         * @param {(any | null)[]} args
         * @returns {Promise<void>}
         * @type {(function_name:string, callback_handle:({id:string,name:string,type:string}),args:(any|null)[])=>Promise<void>}
         */
        const functionDelegate = AlierPlatformSpecifics.functionDelegate;
        
        /**
         * Delegates a synchronous function invocation to the JavaScript interface on the native land.
         * 
         * The implementation of this function depends on the platform on which the application runs.
         * 
         * @param {string} function_name
         * @param {(any | null)[]} args
         * @returns {string} a JSON string representing the return value of the invoked function.
         * @type {(function_name:string, callback_handle:({id:string,name:string,type:string}),args:(any|null)[])=>Promise<void>}
         */
        const functionDelegateSync = AlierPlatformSpecifics.functionDelegateSync;
        
        /**
         * The implementation of `Alier.Sys._sendstat` function.
         * 
         * @param {string} message a string representing a message to be sent.
         * @type {(message: string) => Promise<void>}
         * @see {@link Alier.Sys._sendstat}
         */
        const _sendstat = AlierPlatformSpecifics._sendstat;

        const loadText = AlierPlatformSpecifics.loadText;
        const loadTextSync = AlierPlatformSpecifics.loadTextSync;

        class __SharedObject__ {
            #shared_object_map = new Map();
            #handle_map = new WeakMap();
            /**
             * A number used as an id for shared objects.
             * Shared object ids are unique while they are in-use,
             * i.e. deleted object's ids may be re-used in future.
             * @type {number}
             */
            #next_id = 0;
            /**
             * Set the given object to be a shared object.
             *
             * @param {Object} obj An object to be registered as a shared object
             * @return {({ type: string, name: string, id: string })}
             * a handle object associated with the given object.
             * handle object will have the following fields:
             *
             *   -  `name`: object's name. It will have the same value as the value of `obj.name`.
             *   -  `type`: object's type. It will have the same value as the result of `typeof obj`.
             *   -  `id`  : object's id.   a unique identifier for the given object.
             */
            set(obj) {
                if (this.#handle_map.has(obj)) {
                    return this.#handle_map.get(obj);
                }
                const type = typeof obj;
                const id = this.#next_id.toString(10);
                // Every anonymous function created via a Function constructor has a string "anonymous" as its name.
                // However, mysteriously, this behaviour is not consistent with the case of 
                // creating anonymous functions via function or arrow-function expressions.
                // i.e., in the latter case, an every anonymous function has an empty string as its name.
                // So for convenience, degenerate functions named "anonymous" or "" to "" here.
                const name = (type === "function" && obj.name !== "anonymous") ?
                      obj.name
                    : (typeof obj.constructor === "function" && obj.constructor.name !== "anonymous") ?
                      obj.constructor.name //  TODO: Examine whether this behaviour is preferable or not.
                    : ""
                ;
                this.#shared_object_map.set(id, obj);
                this.#next_id++;
                const handle = { type: type, name: name, id: id };
                this.#handle_map.set(obj, handle);
                return handle;
            }
            
            /**
             * Get a object associated with the given handle.
             *
             * @param {({ type: string, name: string, id: string })} handle
             * a handle object corresponding to the target object.
             * @return {Object | undefined} the target object
             * if the target object is registered on the shared object map,
             * `undefined` otherwise.
             */
            get(handle) {
                if (typeof handle !== "object" || handle === null) {
                    throw new TypeError("`handle` must be an object.");
                }
                if (typeof handle.id   !== "string" ||
                    typeof handle.type !== "string" ||
                    typeof handle.name !== "string"
                ) {
                    throw new TypeError("Given object is not a handle.");
                }
                const obj = this.#shared_object_map.get(handle.id);
                if (typeof obj === handle.type) {
                    return obj;
                }
                return undefined;
            }
            /**
             * Delete an object associated with the given handle from the shared object map.
             *
             * @param {({ type: string, name: string, id: string })} handle
             * a handle object associated with the target object to be deleted.
             * @return {boolean} `true` if deletion is succeeded, `false` otherwise.
             */
            delete(handle) {
                if (typeof handle !== "object" || handle === null) {
                    throw new TypeError("`handle` must be an object.");
                }
                if (typeof handle.id   !== "string" ||
                    typeof handle.type !== "string" ||
                    typeof handle.name !== "string"
                ) {
                    throw new TypeError("Given object is not a handle.");
                }
                const id = handle.id;
                if (this.#shared_object_map.has(id)) {
                    const obj = this.#shared_object_map.get(id);
                    this.#handle_map.delete(obj);
                    return this.#shared_object_map.delete(id);
                }
                return false;
            }
        };
        
        /**
         * Message queue used by `Alier.Sys._sendstat`, `Alier.Sys._recvstat`, `Alier.Sys._wait`.
         */
        const message_queue = new class __MessageQueue__ {
            /**
             * @type {Map<string, ((message: string) => void)[]}
             */
            #callback_map = new Map();
            /**
             * Add a callback to the queue.
             * 
             * @param {(message: string) => void} callback
             * a callback function which to be executed when a message associated with it is coming.
             * @param {string} key
             * a message associated with the given callback.
             * @throws {TypeError} when the argument given as `callback` is not a function.
             * @throws {TypeError} when the argument given as `key` is not a string.
             */
            add(callback, key = "default") {
                if (typeof callback !== "function") {
                    throw new TypeError("`callback` must be a function.");
                }
                if (typeof key !== "string") {
                    throw new TypeError("`key` must be a string.");
                }
                if (!this.#callback_map.has(key)) {
                    this.#callback_map.set(key, []);
                }
                this.#callback_map.get(key).push(callback);
            }
            
            /**
             * Get a callback at the head of the queue associated with the given message.
             * 
             * @param {string} key
             * A message associated with the target callback.
             * @throws {TypeError} when the argument given as `key` is not a string.
             * @returns a callback if it exist. `null` otherwise.
             */
            get(key = "default") {
                if (typeof key !== "string") {
                    throw new TypeError("`key` must be a string.");
                }
                if (!this.has(key)) {
                    return null;
                }
                return this.#callback_map.get(key).shift() || null;
            }
            
            /**
             * Test whether any callbacks is queued in the callback queue
             * associated with the given message.
             * 
             * @param {string} key 
             * A message associated with the target callback queue.
             * @returns `true` if any callbacks is queued, `false` otherwise.
             */
            has(key) {
                return typeof key === "string" &&
                    this.#callback_map.has(key) &&
                    this.#callback_map.get(key).length > 0
                ;
            }
        };
        
        /**
         * Wait until the given message is coming from the Native land.
         * 
         * @param {string} message a string representing the message to be coming.
         * `"default"` is set as the default value.
         * @throws {TypeError} when the argument given as `message` is not a string.
         * @returns a Promise object to be resolved when the message is coming.
         */
        async function _wait(message = "default") {
            if (typeof message !== "string") {
                throw new TypeError("`message` must be a string.");
            }
            return new Promise((resolve) => {
                message_queue.add((...args) => resolve(...args), message);
            });
        }
        
        /**
         * Send a message to the Native land.
         * 
         * @param {string} message a string representing the message to be sent.
         * @throws {TypeError} when the argument given as `message` is not a string.
         */
        async function _recvstat(message) {
            if (typeof message !== "string") {
                throw new TypeError("`message` must be a string.");
            }
            if (!message_queue.has(message)) {
                message =  "default";
            }
            for (let callback = message_queue.get(message);
                callback !== null;
                callback = message_queue.get(message)
            ) {
                callback(message);
            }
        }
        
        /**
         * Register an interface of the native function call on `Alier.Native` object.
         * 
         * This function is invoked from the platform-dependent code by calling `registerFunction()`.
         * In other words, in ordinary cases, this function may not be called directly from the application code.
         * 
         * @param {string} function_name a string representing a function's name.
         * @param {boolean} is_sync a boolean representing whether or not
         * the function to be registered is treated as a synchronous function.
         * The function is treated as a synchronous function if `is_sync` is `true`,
         * `false` otherwise.
         * @throws {TypeError} when the argument given as `function_name` is not a string.
         * @throws {Error} when `Alier.Native` already has a property named the same as the given function name.
         */
        function _registerNativeFunction(function_name, is_sync = false) {
            if (typeof function_name !== "string") {
                throw new TypeError("`function_name` must be a string.");
            }
            if (typeof is_sync !== "boolean") {
                throw new TypeError("`is_sync` must be a boolean.");
            }
            if (is_sync) {
                const fn = {
                    [function_name]: (...args) => {
                        return Alier.Sys._callNativeFunctionSync(function_name, args);
                    }
                }[function_name];
                Object.defineProperty(fn, "toString", { value() { return `function ${this.name}(...args) {\n\t[native code]\n}\n`; } });
                Alier.Native[function_name] = fn;
            } else {
                const fn = {
                    [function_name]: (...args) => {
                        return Alier.Sys._callNativeFunction(function_name, args);
                    }
                }[function_name];
                Object.defineProperty(fn, "toString", { value() { return `function ${this.name}(...args) {\n\t[native code]\n}\n`; } });
                Alier.Native[function_name] = fn;
            }
        }
        
        /**
         * Registers a given JavaScript function to the function registry on the native land.
         * 
         * @param {(...args: any|null) => any|null} f a function to be registered.
         * @throws {TypeError} when the argument given as `f` is not a function.
         */
        function registerFunction(f) {
            if (typeof f !== "function") {
                throw new TypeError("`f` must be a function.");
            }
            const handle = Alier.Sys.SharedObject.set(f);
            return Alier.Native._registerJavaScriptFunction(JSON.stringify(handle));
        }
        /**
         * Replaces the given value to the value which can be passed to the JavaScript interface.
         * 
         * This function replaces the given value as follows:
         * 
         * -  Replace Number / String / Boolean wrapper object with its primitive value
         * -  Replace NaN, undefined, Infinity, -Infinity with "NaN", "undefined", "Infinity", "-Infinity"
         * -  Replace a function with its handle object
         * -  Replace a Map with an equivalent plain Object
         * -  Replace each of other iterables with an equivalent Array object
         * -  Replace an Array-like object with an equivalent Array object
         * -  Replace a Date to an equivalent ISO-format date-time string with offset
         * 
         * @param {*} value an object or a node on some object's property tree.
         * @returns replaced value.
         */
        const _nativeFunctionCallArgsReplacer = (() => {
        /**
         * Converts a Date to a string.
         * 
         * @param {Date} date
         * a Date object to be converted
         * @returns {string}
         * a ISO format string equivalent to the given Date object.
         */
        const dateToString = (date) => {
            if (!(date instanceof Date)) {
                new TypeError("Given parameter was not a Date.");
            }
            const offset = date.getTimezoneOffset();
            if (offset === 0) {
                return date.toISOString();
            }
            const offset_abs  = Math.abs(offset);
            const offset_min  = offset_abs % 60;
            const offset_hour = (offset_abs - offset_min) / 60;
            const offset_str  = `${
                offset > 0 ? "-" : "+"
            }${
                offset_hour.toString().padStart(2, "0")
            }:${
                offset_min.toString().padStart(2, "0")
            }`;
            const yyyy = date.getFullYear();
            const mm   = date.getMonth() + 1;
            const dd   = date.getDate();
            const HH   = date.getHours();
            const MM   = date.getMinutes();
            const SS   = date.getSeconds();
            const FFF  = date.getMilliseconds().toString(10).padStart(3, "0");
            return `${yyyy}:${mm}:${dd}T${HH}:${MM}:${SS}.${FFF}${offset_str}`;
        };
        return (value) => {
            switch (typeof value) {
                case "bigint":
                case "symbol":
                    throw new TypeError(`Cannot pass ${typeof value} as an argument to native functions.`);
                case "string":
                case "boolean":
                    return value;        
                case "function":
                    return Alier.Sys.SharedObject.set(value);
                case "number":
                    if (Number.isNaN(value)) {
                        return "NaN";
                    } else if (value === Number.POSITIVE_INFINITY) {
                        return "Infinity";
                    } else if (value === Number.NEGATIVE_INFINITY) {
                        return "-Infinity";
                    } else {
                        return value;
                    }
                case "undefined":
                    return "undefined"
                case "object":
                    if (value === null) {
                        return null;
                    } else {
                        if (value instanceof Date) {
                            return dateToString(value);
                        } else if ((value instanceof Number) || (value instanceof String) || (value instanceof Boolean)) {
                            return _nativeFunctionCallArgsReplacer(value.valueOf());
                        } else if (value instanceof Map) {
                            return Object.fromEntries(Array.from(value).map(
                                ([k, v]) => [k, _nativeFunctionCallArgsReplacer(v)]
                            ));
                        } else if ((typeof value[Symbol.iterator] === "function") || (typeof value.length === "number")) {
                            return Array.from(value).map(_nativeFunctionCallArgsReplacer);
                        } else {
                            return Object.fromEntries(Object.entries(value).map(
                                ([k, v]) => [k, _nativeFunctionCallArgsReplacer(v)]
                            ));
                        }
                    }
                default:
                    throw new Error("UNREACHABLE");
            }
        };
        })();

        const Base64DecodeTable = new Map([
            ...(Array.prototype.map.call("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", (v, i) => [v.charCodeAt(), i]))
            , ["+".charCodeAt(), 0b111110]  //  Original implementation
            , ["/".charCodeAt(), 0b111111]  //  Original implementation
            , ["-".charCodeAt(), 0b111110]  //  URL safe variant
            , ["_".charCodeAt(), 0b111111]  //  URL safe variant
            , ["=".charCodeAt(), 0b000000]  //  Padding character
        ]);

        const Base64EncodeTable = new Map([
            ...(Array.prototype.map.call("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", (v, i) => [i, v.charCodeAt()]))
            , [0b111110, "+".charCodeAt()]
            , [0b111111, "/".charCodeAt()]
        ]);

        const Base64UrlSafeEncodeTable = new Map([
            ...(Array.prototype.map.call("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", (v, i) => [i, v.charCodeAt()]))
            , [0b111110, "-".charCodeAt()]
            , [0b111111, "_".charCodeAt()]
        ]);

        /**
         * Encodes the given data into a Base64 string.
         * 
         * @param {string | ArrayBuffer | Uint8Array | ({ buffer: ArrayBuffer } )} data 
         * Data to be encoded.
         * 
         * @param {boolean} urlSafe 
         * A boolean indicating whether or not the given data to be encoded in the URL-safe manner.
         * 
         * @returns 
         * A Base64 string.
         * 
         * @throws {TypeError}
         * -  the given argument {@link data} is neither one of a string or `ArrayBuffer` or an `Uint8Array` or an object having an array buffer.
         * -  the given argument {@link urlSafe} is not a boolean.
         */
        function encodeBase64String(data, urlSafe = false) {
            const data_ = (typeof data === "string") ?
                    new TextEncoder().encode(data) :
                (data instanceof ArrayBuffer) ?
                    new Uint8Array(data) :
                (data != null && (data.buffer instanceof ArrayBuffer)) ?
                    new Uint8Array(data.buffer) :
                    data
            ;
            const url_safe = urlSafe;

            if (!(data_ instanceof Uint8Array)) {
                throw new TypeError(`${data} is not an Uint8Array`);
            } else if (typeof url_safe !== "boolean") {
                throw new TypeError(`${url_safe} is not a boolean`);
            }

            const base64 = [];
            for (let i = 0; i < data_.byteLength; i += 3) {

                const b0 = data_[i + 0];
                const b1 = data_[i + 1];
                const b2 = data_[i + 2];

                if (b0 === undefined) { break; }

                const unit = (((b0 ?? 0) << 8 | (b1 ?? 0)) << 8) | (b2 ?? 0);
                
                const u0 = (unit & 0xfc0000) >> 18;
                const u1 = (unit & 0x03f000) >> 12;
                const u2 = (unit & 0x000fc0) >>  6;
                const u3 = (unit & 0x00003f);
                const eq = "=".charCodeAt();

                const encoded_unit = url_safe ? [
                    Base64UrlSafeEncodeTable.get(u0),
                    Base64UrlSafeEncodeTable.get(u1),
                    b1 === undefined ? eq : Base64UrlSafeEncodeTable.get(u2),
                    b2 === undefined ? eq : Base64UrlSafeEncodeTable.get(u3)
                ] : [
                    Base64EncodeTable.get(u0),
                    Base64EncodeTable.get(u1),
                    b1 === undefined ? eq : Base64EncodeTable.get(u2),
                    b2 === undefined ? eq : Base64EncodeTable.get(u3)
                ];

                base64.push(...encoded_unit);

                if (b1 === undefined || b2 === undefined) { break; }
            }

            return new TextDecoder("us-ascii", {fatal: true}).decode(new Uint8Array(base64));
        }

        /**
         * Decodes a Base64 encoded string into an `ArrayBuffer`.
         * 
         * @param {string} b64string a string representing a Base64 encoded byte sequence
         * @throws {TypeError} when the given value is not a string
         * @throws {SyntaxError}
         * -  when the given string's length is not multiple of 4
         * -  when invalid character, a character is neither an alphanumeric nor `+` nor `/` nor `-` nor `_` nor `=`, is found
         */
        function decodeBase64String(b64string) {
            if (typeof b64string !== "string") {
                throw new TypeError(`${b64string} is not a string`);
            } else if (b64string.length % 4 !== 0) {
                throw new SyntaxError("Base64 encoded string's length must be multiple of 4");
            }
            const new_buf       = new ArrayBuffer(b64string.length / 4 * 3)
            const decoded_bytes = new Uint8Array(new_buf);
            let offset = 0;
            for (let i = 0; i < b64string.length; i += 4) {

                const code_0 = b64string.charCodeAt(i + 0);
                const code_1 = b64string.charCodeAt(i + 1);
                const code_2 = b64string.charCodeAt(i + 2);
                const code_3 = b64string.charCodeAt(i + 3);

                //  decode an unit of Base64 characters with the table.
                //  Each of unit_* represents a 6-bit code taken from the original byte sequence.
                const unit_0 = Base64DecodeTable.get(code_0);  //  if code isn't a valid character, get() returns undefined.
                const unit_1 = Base64DecodeTable.get(code_1);  //  ditto.
                const unit_2 = Base64DecodeTable.get(code_2);
                const unit_3 = Base64DecodeTable.get(code_3);

                if (unit_0 === undefined || unit_1 === undefined || unit_2 === undefined || unit_3 === undefined) {
                    throw new SyntaxError(`Invalid character found: ${JSON.stringify(b64string.slice(i, i + 4))}`);
                }

                {
                    const eq = "=".charCodeAt(0);
                    if (code_0 === eq) {
                        break;
                    } else if (code_1 === eq) {
                        const data = unit_0 << 2;
                        const bytes = [data & 0x0000ff];
                        decoded_bytes.set(bytes, offset);
                        offset += 1;
                        break;
                    } else if (code_2 === eq) {
                        const data = ((unit_0 << 6) | unit_1) << 4;
                        const bytes = [(data & 0x00ff00) >> 8, data & 0x0000ff];
                        if (bytes[1] === 0) {
                            bytes.pop();
                        }
                        decoded_bytes.set(bytes, offset);
                        offset += bytes.length;
                        break;
                    } else if (code_3 === eq) {
                        const data = ((((unit_0 << 6) | unit_1) << 6) | unit_2) << 6;
                        const bytes = [(data & 0xff0000) >> 16, (data & 0x00ff00) >> 8, data & 0x0000ff];
                        if (bytes[2] === 0) {
                            bytes.pop();
                        }
                        decoded_bytes.set(bytes, offset);
                        offset += bytes.length;
                        break;
                    } else {
                        //  concatenate 4 of 6-bit ints into a single 24 bit int.
                        const data   = (((((unit_0 << 6) | unit_1) << 6) | unit_2) << 6) | unit_3;
                        const bytes = [(data & 0xff0000) >> 16, (data & 0x00ff00) >> 8, data & 0x0000ff];

                        //  split 24-bit int to 3 of 8 bit ints.
                        decoded_bytes.set(bytes, offset);
                        offset += bytes.length;
                    }
                }
            }

            return new_buf.slice(0, offset);
        }

        /**
         * Decodes a data URL into an object.
         * 
         * @param {string | URL} dataUrl an `URL` or a `string` representing a data URL.
         * @returns
         * Type of the return value is depending on the content-type of the given URL.
         * 
         * -  If the content-type is `text/`, then this function will return a `string`.
         * -  If the content-type is `application/json`, then this function will return any value can being represented as a JSON string.
         * -  Otherwise, this function will return an `Uint8Array`.
         * 
         * @throws {TypeError}
         * -  when the given argument {@link dataUrl} is neither an URL nor a string.
         * @throws {SyntaxError}
         * -  when the given URL does not start with "data:".
         * -  when the given data URL contains a syntax error.
         */
        function decodeDataUrl(dataUrl) {
            const data_url = dataUrl instanceof URL ? dataUrl.toString() : dataUrl;

            if (typeof data_url !== "string") {
                throw new TypeError(`${data_url} is not a string`);
            } else if (!/^data:/i.test(data_url)) {
                throw new SyntaxError(`${JSON.stringify(data_url)} does not start with "data:"`);
            }

            // data-url     ::=  "data:" [content-type] [";" "base64"] "," encoded-data
            // content-type ::=  type "/" subtype *[";" param-name "=" param-value]

            const regex = /,|=|;|:|[\x21\x23-\x2b\x2d-\x39\x3c\x3e-\x7e\x80-\xff]+|"(?:\\"|[^"])*"/g;
            const content_type = { value: undefined, params: null };

            let   wait_param_name  = false;
            let   wait_param_value = false;
            let   param_name       = "";
            const url_body = data_url.replace(/^data:/i, "");
            for (const m of url_body.matchAll(regex)) {
                const token = m[0];

                if (token === ",") {
                    const data = decodePayload(url_body.slice(m.index + 1), {
                        isUrl: true, 
                        isBase64: content_type.params?.base64 ?? false, 
                    });
                    return { data: data, type: content_type.value ?? "text/plain", charset: content_type.params?.charset ?? "utf-8" };
                } else if (token === "=") {
                    if (wait_param_value) {
                        throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} occurs. Missing a parameter-value token.`);
                    } else if (content_type.params == null) {
                        throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} occurs. Missing ";".`);
                    } else if (param_name.length === 0) {
                        throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} occurs. Missing a parameter-name token.`);
                    }
                    wait_param_value = true;
                } else if (token ===  ";") {
                    if (wait_param_name) {
                        throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} occurs. Missing a parameter-name token.`);
                    }
                    if (content_type.params == null) {
                        content_type.params = {};
                    }
                    wait_param_name  = true;
                    param_name       = "";
                } else if (wait_param_value) {
                    if (wait_param_name) {
                        throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} occurs. Missing a parameter-name token.`);
                    }
                    content_type.params[param_name] = token;
                    wait_param_value = false;
                } else if (wait_param_name) {
                    if (param_name.length > 0) {
                        throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} occurs`);
                    }
                    param_name = token.toLowerCase();
                    content_type.params[param_name] = true;
                    wait_param_name = false;
                } else {
                    if (content_type.value !== undefined) {
                        throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} occurs. Duplicate values detected.`);
                    }
                    content_type.value = token;
                }
            }
            throw new SyntaxError("Missing comma preceding encoded data");
        }

        function decodePayload(data, o) {
            if (o === null || typeof o !== "object") {
                throw new TypeError(`${o} is not a non-null object`);
            } else if (typeof data !== "string") {
                throw new TypeError(`${data} is not a string`);
            }

            const is_url     = o.isUrl ?? false;
            const is_base64  = o.isBase64 ?? false;

            return is_base64 ?
                    new Uint8Array(decodeBase64String(data)) :
                is_url ?
                    decodeURIComponent(data) :
                    data
            ;
        } 

        /**
         * Implementation of functions treated as asynchronous ones defined on `Alier.Native`.
         * 
         * This function is invoked via a function call such as `Alier.Native[function_name](...args)`
         * and, in ordinary cases, it may not be called directly.
         * 
         * @param {string} function_name a string representing the name of the function to be called.
         * @param {(any | null)[]} args a sequence of arguments to be passed to the function to be called.
         * @returns {Promise<any>}
         */
        function _callNativeFunction(function_name, args) {
            if (typeof function_name !== "string") {
                throw new TypeError("`function_name` must be a string.");
            }
            return new Promise((resolve, reject) => {
                const callback_handle = Alier.Sys.SharedObject.set((v) => {
                    const { result, error } = v;
                    (error == null) ?
                        resolve(result) :
                        reject(new Error(`Error caused by calling the native function "${function_name}" (${error.message})`))
                    ;
                });
                Alier.Sys._functionDelegate(
                    function_name,
                    callback_handle,
                    _nativeFunctionCallArgsReplacer(args)
                );
            });
        }
        
        /**
         * Implementation of functions treated as synchronous ones defined on `Alier.Native`.
         * 
         * This function is invoked via a function call such as `Alier.Native[function_name](...args)`
         * and, in ordinary cases, it may not be called directly.
         * 
         * @param {string} function_name a string representing the name of the function to be called.
         * @param {(any | null)[]} args a sequence of arguments to be passed to the function to be called.
         * @returns {any}
         */
        function _callNativeFunctionSync(function_name, args) {
            if (typeof function_name !== "string") {
                throw new TypeError("`function_name` must be a string.");
            }
            
            const reviver = (_, value) => {
                switch (value) {
                    case "Infinity":
                        return Number.POSITIVE_INFINITY;
                    case "-Infinity":
                        return Number.NEGATIVE_INFINITY;
                    case "NaN":
                        return Number.NaN;
                    case "undefined":
                        return undefined;
                    default:
                        return value;
                }
            };

            const json = Alier.Sys._functionDelegateSync(function_name, _nativeFunctionCallArgsReplacer(args));
            const { result, error } = JSON.parse(json, reviver);
            if (error != null) {
                throw new Error(`Error caused by calling the native function "${function_name}" (${error.message})`);
            }
            return result;
        }
        
        /**
         * Call a function by the given handle object.
         * 
         * This method is called from the Native land.
         * 
         * @param {boolean} dispose a flag indicating whether or not to dispose the given handle.
         * Dispose the handle when `dispose` is `true`, do nothing otherwise.
         * @param {Object} handle a handle object associated with the function to be invoked.
         * @param {any[]} args an array of arguments passed to the target function.
         * @returns {string} a JSON string representing the return value from the target function.
         * @throws {TypeError} when the argument given as `dispose` is not a boolean.
         */
        function functionCallReceiver(dispose, handle, args) {
            if (typeof dispose !== "boolean") {
                throw new TypeError("`dispose` must be a boolean.");
            }
            const f = Alier.Sys.SharedObject.get(handle);
            if (dispose) {
                Alier.Sys.SharedObject.delete(handle);
            }
            return JSON.stringify(f(...args));
            // TODO: Replace to an alternative function.
            // JSON.stringify does not guarantee equivalence between a floating point number and its string presentation.
        }
        
        const snip_defaults = {
            maxLineLength: 40
        };
        function snip(s, options = snip_defaults) {
            const maxLineLength = options.maxLineLength ?? snip_defaults.maxLineLength;
            const snip_symbol     = " (…) ";
            const max_line_length = (Number.isNaN(maxLineLength) || maxLineLength < 40) ? 40 : Math.floor(maxLineLength);
            const left_length     = (max_line_length - max_line_length % 2) / 2;
            const right_length    = max_line_length - left_length;
            const nth = (() => {
                const cache = { s: undefined, n: undefined, index: undefined, count: undefined };
                return (s, n) => {
                    //  requires
                    //  requires - type check
                    if (typeof s !== "string") {
                        throw new TypeError(`${s} is not a string`);
                    }
                    //  init
                    //  init - convert n to its appropriate value
                    n = Number(n);
                    if (Number.isNaN(n) || n < 0) {
                        n = Infinity;
                    }
                    if (n < Number.MAX_SAFE_INTEGER && !Number.isInteger(n)) {
                        n = Math.floor(n);
                    }
                
                    //  do
                    //  init - return value
                    let index = 0;
                    let count = 0;
                    //  do - apply cache
                    if (cache.s === s && cache.n <= n) {
                        index = cache.index;
                        count = cache.count;
                    }
                
                    //  do - seek index of n-th character
                    for (; index < s.length && count < n; count++) {
                        // get Unicode code-point of index-th character and count its number of code-units.
                        index += String.fromCodePoint(s.codePointAt(index)).length;
                    }
                
                    //  do - update cache
                    cache.s     = s;
                    cache.n     = n;
                    cache.index = index;
                    cache.count = count;
                
                    //  do - return index and count
                    return { index, count };
                };
            })();
            const slice = (s, start, end) => {
                //  requires
                //  requires - type check
                if (typeof s !== "string") {
                    throw new TypeError(`${s} is not a string`);
                }
                //  init
                //  init - count number of characters
                const len = nth(s).count;
                //  init - convert the start index to its appropriate value
                start = Number(start);
                if (Number.isNaN(start) || start < -len) {
                    start = 0;
                } else if (start < 0) {
                    start = start + len;
                }
                if (start < Number.MAX_SAFE_INTEGER && !Number.isInteger(start)) {
                    start = Math.floor(start);
                }
            
                //  init - convert the end index to its appropriate value
                end = Number(end);
                if (Number.isNaN(end)) {
                    end = len;
                } else if (end < -len) {
                    end = 0;
                } else if (end < 0) {
                    end = end + len;
                }
                if (end < Number.MAX_SAFE_INTEGER && !Number.isInteger(end)) {
                    end = Math.floor(end);
                }
            
                //  do
                //  do - return an empty string if either
                //       start index exceeds string length or
                //       the end index precedes the start index.
                if (len <= start || end <= start) {
                    return "";
                }
            
                //  do - seek the start index and the end index
                const i = nth(s, start).index;
                const j = nth(s, end).index;
            
                //  do - return slice of the given string
                return s.slice(i, j);
            };
            const s_ = (typeof s === "string" ? s : s.toString());
            const len = nth(s_).count;
            const lines = len > max_line_length ?
                `${slice(s_, 0, left_length)}${snip_symbol}${slice(s_, -right_length)}`.split("\n") :
                [s_]
            ;
            return lines.length < 2 ? lines[0] : `${lines[0]}${snip_symbol}${lines[lines.length - 1]}`;
        };

        const dump_defaults = Object.assign({
            format: ({value, type}) => `${value}::${type}`
        }, snip_defaults);
        /**
         * Converts the given object or primitive to the string explaining about its value and type.
         * 
         * __CAVEAT: THIS FUNCTION IS DESIGNED FOR DEBUGGING PURPOSES. DO NOT USE FOR OTHER PURPOSES.__
         *  
         * @param {any} o
         * An object or a primitive to be dumped
         * 
         * @param {object} options 
         * @param {number} options.maxLineLength
         * Maximum length of a line measured in units of Unicode code-points.
         * 
         * If a line exceeds this limit, it will be snipped to fit the limit.
         * 
         * By default, the limit is set to 40 characters.
         * 
         * @param {({ value: string, type: string }) => string} options.format
         * A function formats a pair of a value and its type.
         * 
         * A object such as `{ value, type }` will be passed as a parameter for this function,
         * and each of the given object's properties is already converted to a string. 
         * 
         * This function will be invoked when object data is given.
         * For primitive data, this function will not be invoked.
         * 
         * By default, the value-type pair will be converted to `"{value}::{type}"`.
         * 
         * @param {WeakSet?} _refs
         * A weak set of references included in the given object.
         * This set is used to detect circular reference and updated during recursive calls.
         * 
         * @returns
         * A string containing a string representation of the given object with its type.
         * 
         * @see
         * - {@link dumpArgs}
         * - {@link logFilter}
         * - {@link logd}
         * - {@link logi}
         * - {@link logw}
         * - {@link loge}
         * - {@link logf}
         */
        const dump = (()=> {
            const null_prototype_object_tag = "[null-protoType object]";
            return (o, options = dump_defaults, _refs = new WeakSet()) => {
                const format = options.format ?? dump_defaults.format;
                if (!(_refs instanceof WeakSet)) {
                    _refs = new WeakSet();
                }
                switch (typeof o) {
                case "undefined":
                    return "undefined";
                case "string":
                    return JSON.stringify(snip(o, options));
                case "bigint":
                    return snip(`${o}n`, options);
                case "number":
                case "boolean":
                case "symbol":
                    return snip(o.toString(), options);
                case "function":
                    return format({
                        value: snip(o.toString(), options),
                        type : `function ${o.name}()`
                    });
                case "object":
                    if (o === null) {
                        return "null";
                    } else if (_refs.has(o)) {
                        return "[circular reference]";
                    } else {
                        _refs.add(o);
                        if (o instanceof Map) {
                            const entries = [...o];
                            return format({
                                value: ["{", entries.reduce((_, [k, v], i, self) => {
                                    self[i] = `${dump(k, options, _refs)}: ${dump(v, options, _refs)}`;
                                    return self;
                                }, entries).join(", "), "}"].join(""),
                                type : o.constructor?.name ?? null_prototype_object_tag
                            });
                        } else if (o instanceof Date) {
                            return format({
                                value: o.toISOString(),
                                type : o.constructor.name
                            });
                        } else if ((o instanceof Number) || (o instanceof String) || (o instanceof Boolean)) {
                            return format({
                                value: o.toString(),
                                type : o.constructor.name
                            });
                        } else if (o instanceof Error) {
                            return format({
                                value: JSON.stringify(o.message),
                                type : o.constructor.name
                            });
                        } else if (typeof o[Symbol.iterator] === "function") {
                            const values = [...o];
                            return format({
                                value: [ "[", values.reduce((_, v, i, self) => {
                                    self[i] = dump(v, options, _refs);
                                    return self;
                                }, values).join(", "), "]" ].join(""),
                                type : o.constructor?.name ?? null_prototype_object_tag
                            });
                        } else {
                            const entries = Object.entries(o);
                            return format({
                                value: ["{", entries.reduce((_, [k, v], i, self) => {
                                    self[i] = `${dump(k, options, _refs)}: ${dump(v, options, _refs)}`;
                                    return self;
                                }, entries).join(", "), "}"].join(""),
                                type : o.constructor?.name ?? null_prototype_object_tag
                            });
                        }
                    }
                }
            };
        })();

        /**
         * A helper function for dumping a set of a function parameters.
         * 
         * CAVEAT: THIS FUNCTION IS DESIGNED FOR DEBUGGING PURPOSES. DO NOT USE FOR OTHER PURPOSES.
         *  
         * @param {object} argObj
         * An object containing a set of function parameters.
         * 
         * Each name of properties represents the corresponding parameter's name and
         * Each value of properties represents the corresponding parameter's value.
         * 
         * @param {object} options 
         * @param {number} options.maxLineLength
         * Maximum length of a line measured in units of Unicode code-points.
         * 
         * If a line exceeds this limit, it will be snipped to fit the limit.
         * 
         * By default, the limit is set to 40 characters.
         * 
         * @param {({ value: string, type: string }) => string} options.format
         * 
         * A function formats a pair of a value and its type.
         * 
         * By default, the value-type pair will be converted to `"{value}::{type}"`.
         * 
         * @returns
         * A string containing a string representation of the given object with its type.
         * 
         * @see
         * - {@link dump}
         * - {@link logFilter}
         * - {@link logd}
         * - {@link logi}
         * - {@link logw}
         * - {@link loge}
         * - {@link logf}
         */
        const dumpArgs = (argObj, options = dump_defaults) => {
            return Object.entries(argObj).map(([k, v]) => `${k} = ${dump(v, options)}`).join(", ");
        };

        //  define Alier.SysEvent
        Object.defineProperty(Alier, "SysEvent", {
            writable     : false,
            configurable : false,
            enumerable   : true,
            value        : new MessagePorter(),
        });
        //  define Alier.SysController
        Object.defineProperty(Alier, "SysController", {
            writable     : false,
            configurable : false,
            enumerable   : true,
            value        : new MessagePorter(),
        });

        //  define Alier.Native
        Object.defineProperty(Alier, "Native", {
            writable    : false,
            configurable: false,
            enumerable  : true,
            value       : {},
        });
        
        //  define Alier.Sys
        //  Any function or constant referenced via Alier.Sys, such as Alier.Sys.logd,
        //  should be included in the below definition.
        Object.defineProperty(Alier, "Sys", {
            writable    : false,
            configurable: false,
            enumerable  : true,
            value       : {
                SharedObject           : new __SharedObject__(),
                _registerNativeFunction: _registerNativeFunction,
                _callNativeFunction    : _callNativeFunction,
                _callNativeFunctionSync: _callNativeFunctionSync,
                _functionCallReceiver  : functionCallReceiver,
                _functionDelegate      : functionDelegate,
                _functionDelegateSync  : functionDelegateSync,
                _sendstat              : _sendstat,
                loadText               : loadText,
                loadTextSync           : loadTextSync,
                _recvstat              : _recvstat,
                _wait                  : _wait,
                dump                   : dump,
                dumpArgs               : dumpArgs,
                logFilter              : logFilter,
                logd                   : logd,
                logi                   : logi,
                logw                   : logw,
                loge                   : loge,
                logf                   : logf,
                _registerLaunchApp     : _registerLaunchApp,
                _launchOtherApp        : _launchOtherApp,
                decodeDataUrl          : decodeDataUrl,
                decodeBase64String     : decodeBase64String,
                encodeBase64String     : encodeBase64String,
            },
        });
        Alier.registerFunction = registerFunction;
        Object.defineProperty(Alier, "registerFunction", { writable: false, configurable: false, enumerable: true });
        Alier.Sys._registerNativeFunction("_registerJavaScriptFunction");
        await Alier.registerFunction(_registerNativeFunction);

        await Alier.registerFunction(Alier.setEnv);
        await Alier.registerFunction(Alier.getEnv);
    }

    let ua = navigator.userAgent;
    if(/Chrome/.test(ua)){
        let start = ua.indexOf("Chrome")
        let end = ua.indexOf(" ", start)
        let browser = ua.substring(start+7, end)
        Alier.setEnv("BROWSER_VER", browser)
    }else if(/Mac OS/.test(ua)){
        let start = ua.indexOf("Version")
        let end = ua.indexOf(" ", start)
        let browser = ua.substring(start+8, end)
        Alier.setEnv("BROWSER_VER", browser)
    }

    delete globalThis.AlierPlatformSpecifics;

    //  Make every enumerable properties in Alier.Sys read-only and non-configurable.
    //  And if the property name starts with underscore "_", make it non-enumerable.
    //  This prevents the properties from being redefined.
    for (const key of Object.keys(Alier.Sys)) {
        Object.defineProperty(Alier.Sys, key, {
            writable    : false,
            configurable: false,
            enumerable  : !(key.startsWith("_"))
        });
    }
    //  Make every enumerable properties in Alier.Sys read-only but configurable.
    //  And if the property name starts with underscore "_", make it non-enumerable.
    //  This prevents the properties from being reassigned.
    for (const key of Object.keys(Alier.Native)) {
        Object.defineProperty(Alier.Native, key, {
            writable    : false,
            configurable: true,
            enumerable  : !(key.startsWith("_"))
        });
    }
    // return Alier module object.
    return Alier;
}

/**
 * Sets log filter configurations.
 * 
 * @param {number} minLogLevel 
 * An integer representing the lowest log level to be shown.
 * This argument should be one of the following:
 * 
 * -  {@link LogLevel.DEBUG}
 * -  {@link LogLevel.INFO}
 * -  {@link LogLevel.WARN}
 * -  {@link LogLevel.ERROR}
 * -  {@link LogLevel.FAULT}
 * 
 * @param {number} startId 
 * An integer representing the lower end of the range of log ids to be shown.
 * 
 * @param {number} endId 
 * An integer representing the higher end of the range of log ids to be shown.
 * 
 * @returns {[logLevel: number, startId: number, endId: number]}
 * an array of old configurations.
 */
function logFilter(minLogLevel, startId, endId) {
    const   prev_level    = LogFilterConfig.minLogLevel,
            prev_start_id = LogFilterConfig.startId,
            prev_end_id   = LogFilterConfig.endId
    ;

    const   level    = Number(minLogLevel),
            start_id = Number(startId),
            end_id   = Number(endId)
    ;

    if (Number.isNaN(level) || Number.isNaN(start_id) || Number.isNaN(end_id) || start_id > end_id) {
        // ignore invalid input
        return [prev_level, prev_start_id, prev_end_id];
    }

    switch (level) {
    case LogLevel.DEBUG:
    case LogLevel.INFO:
    case LogLevel.WARN:
    case LogLevel.ERROR:
    case LogLevel.FAULT: {
        LogFilterConfig.minLogLevel = level;
        LogFilterConfig.startId     = start_id;
        LogFilterConfig.endId       = end_id;
        break;
    }
    default:
        // ignore unknown log level
    }

    return [prev_level, prev_start_id, prev_end_id];
}

// Shown on Logcat but not on Chrome inspect
function logd(id, ...messages) {
    log(LogLevel.DEBUG, id, ...messages);
}

function logi(id, ...messages) {
    log(LogLevel.INFO, id, ...messages);
}

function logw(id, ...messages) {
    log(LogLevel.WARN, id, ...messages);
}

function loge(id, ...messages) {
    log(LogLevel.ERROR, id, ...messages);
}

// JavaScript dose not have fault log level, so it outputs at the error log level.
function logf(id, ...messages) {
    log(LogLevel.FAULT, id, ...messages);
}

function log(level, id, ...messages) {
    const { minLogLevel, startId, endId } = LogFilterConfig;
    if (level >= minLogLevel && ((id >= startId && id <= endId) || (id >= 0 && id <= 999))) {
        const fixed_digits = (n, padding) => {
            const digits = n.toString();
            return digits.length < padding.length ?
                (padding + digits).slice(-padding.length) :
                digits
            ;
        };
        const zero_pad_id = fixed_digits(id, "0".repeat(4));
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(`alier:JS:DEBUG:${zero_pad_id}: `, ...messages);
                break;
            case LogLevel.INFO:
                console.info(`alier:JS:INFO:${zero_pad_id}: `, ...messages);
                break;
            case LogLevel.WARN:
                console.warn(`alier:JS:WARN:${zero_pad_id}: `, ...messages);
                break;
            case LogLevel.ERROR:
                console.error(`alier:JS:ERROR:${zero_pad_id}: `, ...messages);
                break;
            case LogLevel.FAULT:
                console.error(`alier:JS:FAULT:${zero_pad_id}: `, ...messages);
                break;
        }
    }
}

//  ---- END: function declarations ----
})();


function _registerLaunchApp(name, uri) {
    Alier.Native.registerLaunchApp(name, uri);
}

function _launchOtherApp(action, params) {
    Alier.Native.launchOtherApp(action, JSON.stringify(params));
}
