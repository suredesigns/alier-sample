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

import { Overload } from "/alier_sys/Overload.js";

function countChars(s) {
    if (typeof s !== "string") {
        throw new TypeError("'s' must be a string");
    }
    let count = 0;
    let index = 0;
    const len = s.length;
    while (index < len) {
        const cp = s.codePointAt(index);
        if (typeof cp !== "number") {
            break;
        }
        count++;
        index += String.fromCodePoint(cp).length;
    }
    return count;
}

function getCharIndex(s, countUntil = 0) {
    if (typeof s !== "string") {
        throw new TypeError("'s' must be a string");
    }
    if (!Number.isSafeInteger(countUntil)) {
        throw new TypeError("'countUntil' must be a safe integer.");
    }
    if (countUntil < 0) {
        countUntil = Math.max(0, countChars(s) + countUntil);
    }
    if (countUntil === 0) {
        return 0;
    }
    let count = 0;
    let index = 0;
    const len = s.length;
    while (index < len) {
        const cp = s.codePointAt(index);
        if (typeof cp !== "number") {
            break;
        }
        count++;
        if (count >= countUntil) {
            break;
        }
        index += String.fromCodePoint(cp).length;
    }
    return index;
}

/**
 * Snips the given string.
 * 
 * @param {string} s
 * a string to be snipped.
 * 
 * @param {*} limit 
 * a number representing the maximum count of characters.
 * 
 * @returns 
 */
function defaultSnipper(s, limit) {
    const count = countChars(s);
    if (count <= limit) {
        return s;
    }
    const mid = Math.round(limit / 2);
    const snip_from = getCharIndex(s, mid);
    const snip_to   = getCharIndex(s, count - (limit - mid));
    
    return `${s.slice(0, snip_from)}\n--(snip)--\n${s.slice(snip_to)}`;
}

function diff(expected, actual) {
    const is_error_type = (o) => {
        if (typeof o !== "function") {
            return false;
        }
        for (let proto = o; proto != null && proto !== Object; proto = Object.getPrototypeOf(proto)) {
            if (proto === Error) {
                return true;
            }
        }
        return false;
    };
    if (is_error_type(expected)) {
        return actual.constructor === expected ? {} : { expected, actual };
    } else if (actual instanceof Error) {
        return { expected, actual };
    } else if (typeof expected === "function") {
        return expected(actual) ? {} : { expected, actual };
    } else if (expected !== null && typeof expected === "object") {
        if (!(actual !== null && typeof actual === "object") || actual.constructor !== expected.constructor) {
            return { expected, actual };
        }
        if ((expected instanceof Date)    ||
            (expected instanceof String)  ||
            (expected instanceof Number)  ||
            (expected instanceof Boolean)
        ) {
            // Built-in objects associated with primitive values
            return diff(expected.valueOf(), actual.valueOf());
        } else if (typeof expected[Symbol.iterator] === "function") {
            // Enumerable objects such as Array, Set, Dictionary, etc.
            const array_expected = Array.from(expected);
            const array_actual   = Array.from(actual);
            const diff_result    = { expected: {}, actual: {} };
            const imax           = Math.max(array_expected.length, array_actual.length);
            for (let i = 0; i < imax; i++) {
                const d = diff(array_expected[i], array_actual[i]);
                if ("expected" in d) {
                    diff_result.expected[i] = d.expected;
                    diff_result.actual[i]   = d.actual;
                }
            }
            for (const _ in diff_result.expected) {
                return diff_result;
            }
            return {};
        } else {
            // Other general objects
            const diff_result    = { expected: {}, actual: {} };
            const keys           = new Set([...Object.keys(expected), ...Object.keys(actual)]);
            for (const k of keys) {
                const d = diff(expected[k], actual[k]);
                if ("expected" in d) {
                    diff_result.expected[k] = d.expected;
                    diff_result.actual[k]   = d.actual;
                }
            }
            for (const _ in diff_result.expected) {
                return diff_result;
            }
            return {};
        }
    } else if (typeof expected === "number") {
        if (typeof actual !== "number") {
            return { expected, actual };
        }
        if (!Number.isInteger(expected)) {
            Alier.Sys.logw(0, 
                `${doTest.name}(): ${diff.name}(): Non-integral numbers are compared for equality.`,
                "This may be too strict to guarantee normality."
            );
        }
        return Object.is(expected, actual) ? {} : { expected, actual };
    } else {
        return expected === actual ? {} : { expected, actual };
    }
}

/**
 * Compares the two given values.
 * 
 * If the expected one is a constructor of some Error class,
 * then tests whether the actual one is an instance of the expected class.
 * 
 * If the expected one is a function, passing the actual one to it.
 * 
 * @param {any | (actual: any) => boolean} expected 
 * @param {*} actual 
 * @returns {boolean}
 * `true` if the actual one is equivalent to the expected in some sense.
 * `false` otherwise.
 */
function compare(expected, actual) {
    return !("expected" in diff(expected, actual));
}

class TestCase {
    /**
     * @type {any | (actual: any) => boolean}
     */
    expected;
    /**
     * @type {any[]}
     */
    args;
    /**
     * @type {string}
     */
    tag;
    constructor({ expected, args, tag = null }) {
        if (args == null) {
            throw new TypeError("'args' was not provided as a parameter.");
        } else if (!Array.isArray(args)) {
            throw new TypeError("'args' must be an array.");
        }
        this.expected = expected;
        this.args     = args;
        this.tag      = typeof tag !== "string" ? "" : tag;
    }
    static make(...objects) {
        return objects.map(o => new TestCase(o));
    }
}

class TestStatus {
    static ABORTED   = new TestStatus("ABORTED");
    static SUCCEEDED = new TestStatus("SUCCEEDED");
    static FAILED    = new TestStatus("FAILED");
    /** @type {string} */
    #status;
    /**
     * @param {string} status 
     */
    constructor(status) {
        if (typeof status !== "string") {
            throw new TypeError("'status' must be a string.");
        }
        if (status.trim() === "") {
            throw new RangeError("'status' must not be empty.");
        }
        this.#status = status;
    }
    toString() {
        return this.#status;
    }
}

class TestDetails {
    tag;
    status;
    args;
    expected;
    asyncExpected;
    actual;
    wasAsync;
    constructor({
        tag           = null,
        status        = TestStatus.SUCCEEDED,
        args          = null,
        expected      = undefined,
        asyncExpected = false,
        actual        = undefined,
        wasAsync      = false
    }) {
        if (!(status instanceof TestStatus)) {
            throw new TypeError("'status' must be a TestStatus.");
        }
        if (!Array.isArray(args)) {
            throw new TypeError("'args' must be an Array.");
        }
        if (typeof asyncExpected !== "boolean") {
            throw new TypeError("'asyncExpected' must be a boolean.");
        }
        if (typeof wasAsync !== "boolean") {
            throw new TypeError("'wasAsync' must be a boolean.");
        }
        this.tag           = typeof tag !== "string" ? "" : tag;
        this.status        = status;
        this.args          = args;
        this.expected      = expected;
        this.asyncExpected = asyncExpected;
        this.actual        = actual;
        this.wasAsync      = wasAsync;
    }
    toString (options) {
        const limit = (options != null && typeof options.limit === "number" && Number.isSafeInteger(options.limit)) ?
            (options.limit >= 0 ?
                options.limit :
                Number.MAX_SAFE_INTEGER
            ) :
            1000
        ;
        const snip  = (options != null && typeof options.snip === "function") ?
            options.snip :
            defaultSnipper
        ;
        const zip = (x, y) => {
            const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
            const zipped = new Array(keys.size);
            let i = 0;
            for (const k of keys) {
                zipped[i] = [k, x[k], y[k]];
                i++;
            }
            return zipped;
        };
        const diff_result = diff(this.expected, this.actual);
        const diff_zipped = ("expected" in diff_result) ? zip(diff_result.expected, diff_result.actual) : [];
        const diff_description = diff_zipped
            .map(([k, e, a]) => `${k}: ${asString(e, this.asyncExpected)} => ${asString(a, this.wasAsync)}`)
            .join(",\n\t")
        ;

        return `(${
                ""
            } \n  tag     : ${
                this.tag === "" ? "(no tag)" : this.tag
            },\n  status  : ${
                this.status
            },\n  args    : \n\t${
                this.args.map((arg, i) => ("$" + i +": " + snip(asString(arg), limit))).join(",\n\t")
            },\n  expected: ${
                snip(asString(this.expected, this.asyncExpected), limit)
            },\n  actual  : ${
                snip(asString(this.actual, this.wasAsync), limit)
            },\n  diff    : {\n\t${
                diff_description
            }\n})`
        ;
    };
}

class TestResult {
    summary = TestStatus.SUCCEEDED;
    /** @type {TestDetails[]} */
    details = [];
    title;
    feature;
    constructor({ title, feature }) {
        if (typeof title !== "string") {
            throw new TypeError("'title' must be a string.");
        } else if (title.trim() === "") {
            throw new TypeError("'title' must be neither empty or space-only string.");
        }
        if (typeof feature !== "function") {
            throw new TypeError("'feature' must be a function.");
        }
        this.title   = title;
        this.feature = feature;
    }
    toString(options) {
        const limit = (options != null && typeof options.limit === "number" && Number.isSafeInteger(options.limit)) ?
            (options.limit >= 0 ?
                options.limit :
                Number.MAX_SAFE_INTEGER
            ) :
            1000
        ;
        const snip  = (options != null && typeof options.snip === "function") ?
            options.snip :
            defaultSnipper
        ;
        const details = this.details.reduce((acc, detail, index) => {
            acc.push(`CASE ${index}  ==>  ${detail.toString({ snip, limit })}`);
            return acc;
        }, []).join("\n");
        return `title = ${this.title}, summary = ${this.summary}\n${details}`;
    }
}
/**
 * Runs a set of the test cases for the given function.
 * 
 * Note that this function returns a `Promise`, so in order to get the
 * result, use `await` on the result if you're in an `async` function;
 * otherwise, call its `then()` method.
 * 
 * @param {string} title 
 * Test title
 * 
 * @param {function} feature
 * A function to be tested
 * 
 * @param {boolean} asyncExpected 
 * A boolean indicating whether the return value of the function
 * under test is expected to be returned as a `Promise` / `Thenable`.
 * 
 * @param {null | (...data: any) => any} logger
 * Log output function.
 * 
 * If not specified, `console.debug` will be used.
 * 
 * @param {null | (s: string, limit: number) => string} snip
 * A function to perform string snippers.
 *
 * If not specified, `defaultSnipper` will be used.
 * 
 * This function is applied separately to each test case argument,
 * expected result, and actual result string.
 * 
 * @param {null | number} limit
 * The maximum number of characters that cannot be omitted.
 * The method for calculating the number of characters depends on `snip`.
 * 
 * @param  {...TestCase} testCases 
 * A sequence of test case objects, each containing the arguments for
 * the function to be tested as the `args` property, and the expected
 * result as the `expected` property.
 * 
 * The `args` is an array of arguments that can be passed to the
 * function to be tested.
 * 
 * The `expected` property is either any comparable value with
 * the result of the function to be tested, or a function that
 * takes the actual result as an argument and tests whether
 * the actual result satisfies the expected condition.
 */
async function doTest({
        title = "(no titled)",
        feature,
        asyncExpected = false,
        logger        = null,
        snip          = null,
        limit         = null
    }, ...testCases) {
    if (typeof logger !== "function") {
        logger = (...data) => Alier.Sys.logd(0, ...data);
    }
    if (typeof snip !== "function") {
        snip = defaultSnipper;
    }
    if (!Number.isSafeInteger(limit)) {
        limit = 1000;
    }
    const do_log = (msg, test_results) => {
        if (test_results.summary === TestStatus.ABORTED) {
            Alier.Sys.loge(0, msg);
        }
        const details = test_results.details.reduce((acc, case_result, case_index) => {
            acc.push(`CASE ${case_index}  ==>  ${case_result.toString({snip, limit})}`);
            return acc;
        }, []);
        logger(`${doTest.name}(): Test on "${test_results.title}" ${msg}. summary = ${test_results.summary}`);
        for (const detail of details) {
            logger(detail);
        }
    };
    const aborted = (msg, test_results) => {
        test_results.summary = TestStatus.ABORTED;
        do_log(msg, test_results);
        return test_results;
    };
    let test_results;
    try {
        test_results = new TestResult({ title, feature });
    } catch (e) {
        test_results = new TestResult({ title: "(aborted)", feature: () => "aborted" });
        return aborted(e.message, test_results);
    }
    let test_cases;
    try {
        test_cases = TestCase.make(...testCases);
    } catch (e) {
        return aborted(e.message, test_results);
    }
    for (const test_case of test_cases) {
        let test_details; 
        try {
            test_details = new TestDetails({
                tag          : test_case.tag,
                args         : test_case.args,
                expected     : test_case.expected,
                asyncExpected: asyncExpected,
            });
        } catch (e) {
            return aborted(e.message, test_results);
        }
        const args     = test_case.args;
        const expected = test_case.expected;
        let actual     = undefined;
        let was_async  = false;
        try {
            actual = feature(...args);
            if (actual !== null && typeof actual === "object" && typeof actual.then === "function") {
                was_async = true;
                actual = await actual;
            }
        } catch (e) {
            actual = e;
        }
        test_details.wasAsync = was_async;
        test_details.actual   = actual;
        try {
            test_details.status   = (asyncExpected === was_async) && compare(expected, actual) ?
                  TestStatus.SUCCEEDED
                : TestStatus.FAILED
            ;
        } catch (e) {
            Alier.Sys.loge(0, e);
            test_details.status   = TestStatus.ABORTED;
        }
        test_results.details.push(test_details);
    }
    test_results.summary = test_results.details.every(
            (detail) => detail.status === TestStatus.SUCCEEDED
        ) ?
          TestStatus.SUCCEEDED
        : TestStatus.FAILED
    ;
    do_log("done", test_results);
    return test_results;
}
function asString(o, asyncExpected) {
    const classname = (typeof o) !== "object" ?
        (typeof o) :
        (o === null ? "null" : o.constructor.name)
    ;
    let value_string = "";
    switch (typeof o) {
        case "undefined":
            value_string = "undefined";
            break;
        case "symbol":
        case "function":
        case "boolean":
        case "bigint":
        case "number":        
            value_string =  o.toString();
            break;
        case "string":
            value_string =  JSON.stringify(o);
            break;
        case "object":
            if (o === null) {
                value_string = "null";
            } else if (o instanceof Date) {
                value_string = o.toISOString();
            } else if (o instanceof String) {
                value_string = JSON.stringify(o.toString());
            } else if ((o instanceof Number) || (o instanceof Boolean)) {
                value_string = o.toString();
            } else if (typeof o[Symbol.iterator] === "function") {
                /** @type {string[]} */
                let line = [];
                const lines = [line];
                let line_len = 0;
                for (const item of Array.from(o)) {
                    const item_str = asString(item, false);
                    line_len += item_str.length;
                    line.push(item_str);
                    if (line_len > 100) {
                        line_len = 0;
                        lines[lines.length - 1] = line.join(", ");
                        line = [];
                        lines.push(line);
                    }
                }
                value_string = `[${lines.join("\n")}]`;
            } else if (o instanceof Error) {
                const errors = [];
                errors.push({
                    ctor   :
                        typeof o.constructor === "function" &&
                        typeof o.constructor.name === "string" ?
                            o.constructor.name :
                            "Error"
                    ,
                    message: o.message,
                    stack  : o.stack
                });
                let cause = o.cause;
                while (cause != null) {
                    errors.push({
                        ctor   : 
                            typeof cause.constructor === "function" &&
                            typeof cause.constructor.name === "string" ?
                                cause.constructor.name :
                                "Error"
                        ,
                        message: cause.message,
                        stack  : cause.stack,
                    });
                    cause = cause.cause;
                }
                value_string = errors.map(e => {
                    let s = "{";
                    if (e.ctor    !== undefined) {
                        s += `    constructor: ${e.ctor}\n`;
                    }
                    if (e.message !== undefined) {
                        s += `    message    : ${e.message}\n`;
                    }
                    if (e.stack   !== undefined) {
                        s += `    stack      : ${e.stack}\n`;
                    }
                    s += "}";
                    return s;
                }).join(",\ncause: ");

            } else {
                /** @type {string[]} */
                let line = [];
                const lines = [line];
                let line_len = 0;
                for (const [key, item] of Object.entries(o)) {
                    const item_str = asString(item, false);
                    line_len += item_str.length;
                    line.push(`${key}: ${item_str}`);
                    if (line_len > 100) {
                        line_len = 0;
                        lines[lines.length - 1] = line.join(", ");
                        line = [];
                        lines.push(line);
                    }
                }
                value_string = `{${lines.join("\n")}}`;
            }
            break;
        default:
            throw new Error("UNREACHABLE");
    }
    return asyncExpected ?
        `${value_string} (: Promise<${classname}>)` :
        `${value_string} (: ${classname})`
    ;
};

/**
 * Create a function associated with the given task function.
 * The created function runs the given task when invoked and it provides the result of the task and
 * a flag representing whether the task is rejected or not (where "reject" means both of
 * the returned Promise was literally rejected and the task function raised an error).
 *  
 * @param {(...args: any) => any} task 
 * A function to be converted.
 * 
 * @returns
 * The wrapper function of the given function.
 */
const inspect = (task) => {
    /**
     * Runs the associated task with the given arguments.
     * 
     * @param  {...any} args 
     * arguments for the task.
     * 
     * @returns {Promise<({
     *      value   : any,
     *      rejected: boolean
     *  })> | ({
     *      value   : any,
     *      rejected: boolean
     *  })}
     * result of the task with additional information.
     * 
     */
    const run_task_with = (...args) => {
        try {
            const value = task(...args);
            if (value instanceof Promise) {
                return value.then(
                    (v) => ({ value: v, rejected: false }),
                    (e) => ({ value: e, rejected: true  })
                );
            } else {
                return { value, rejected: false };
            }
        } catch (e) {
            return { value: e, rejected: true };
        }
    };
    return run_task_with;
};

const symbol_prototype = Symbol.for("alier:TestTool/prototype"); 
const symbol_empty     = Symbol.for("alier:TestTool/empty");

Overload.for(Object).define("difference", function(other) {
    if (this === other) { return undefined; }

    const diff = new Map();
    {
        const self_proto  = this?.constructor?.prototype ?? null;
        const other_proto = other?.constructor?.prototype ?? null;
        if (self_proto !== other_proto) {
            diff.set(symbol_prototype, { left: self_proto, right: other_proto });
            return diff;
        }
    }
    const keys = new Set();
    for (const k of [...Object.getOwnPropertyNames(this), ...Object.getOwnPropertySymbols(this)]) {
        keys.add(k);
    }
    for (const k of [...Object.getOwnPropertyNames(other), ...Object.getOwnPropertySymbols(other)]) {
        keys.add(k);
    }
    const promises = [];
    for (const k of keys) {
        if (!(k in this)) {
            const right = other[k];
            diff.set(k, { left: symbol_empty, right: right });
            continue;
        } else if (!(k in other)) {
            const left = this[k];
            diff.set(k, { left: left, right: symbol_empty });
            continue;
        }

        const left  = this[k];
        const right = other[k];

        if (left !== null && typeof left === "object") {
            const result = Overload.invoke(left, "difference", right);
            if (result instanceof Promise) {
                promises.push(result.then((result) => {
                    if (result != null) {
                        diff.set(k, result);
                    }
                }));
            } else if (result != null) {
                diff.set(k, result);
            }
        } else if (!Object.is(left, right)) {
            diff.set(k, { left, right });
        }
    }
    return (promises.length > 0) ?
        Promise.all(promises).then(() => (diff.size > 0 ? diff : undefined)) :
        diff.size > 0 ? diff : undefined
    ;
})
.define("equals", function(other) {
    const diff = Overload.invoke(this, "difference", other);
    return (diff instanceof Promise) ?
        diff.then(diff => (diff == null)) :
        (diff == null)
    ;
});

Overload.for(Comment).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left, right });
            return diff;
        }
    }
    const left  = this.textContent;
    const right = other.textContent;
    if (!Object.is(left, right)) {
        return { left, right };
    } else {
        return undefined;
    }
});

Overload.for(Text).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left, right });
            return diff;
        }
    }
    const left  = this.textContent;
    const right = other.textContent;
    if (!Object.is(left, right)) {
        return { left, right };
    } else {
        return undefined;
    }
});

Overload.for(Attr).define("difference", function(other) {
    if (this === other) { return undefined; }

    const diff = new Map();

    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            diff.set(symbol_prototype, { left, right });
            return diff;
        }
    }
    {
        const left  = this.name;
        const right = other.name;
        if (!Object.is(left, right)) {
            diff.set("value", { left, right });
        }
    }
    {
        const left  = this.value;
        const right = other.value;
        if (!Object.is(left, right)) {
            diff.set("value", { left, right });
        }
    }
    
    return diff.size > 0 ? diff : undefined;
});

Overload.for(Element).define("difference", function(other) {
    if (this === other) { return undefined; }

    const diff = new Map();
    {
        const self_proto  = this.constructor.prototype;
        const other_proto = other?.constructor?.prototype ?? null;
        if (self_proto !== other_proto) {
            diff.set(symbol_prototype, { left: self_proto, right: other_proto });
            return diff;
        }
    }
    /** @type {Map<string, string>} */
    const self_attributes  = new Map();
    /** @type {Map<string, string>} */
    const other_attributes = new Map();
    /** @type {Set<string>} */
    const keys = new Set();
    for (const attribute of this.attributes) {
        keys.add(attribute.name);
        self_attributes.set(attribute.name, attribute.value);
    }
    for (const attribute of other.attributes) {
        keys.add(attribute.name);
        other_attributes.set(attribute.name, attribute.value);
    }
    const attr_diff = new Map();
    for (const k of keys) {
        if (!self_attributes.has(k)) {
            const right = other_attributes.get(k);
            attr_diff.set(k, { left: symbol_empty, right: right });
            continue;
        } else if (!other_attributes.has(k)) {
            const left = self_attributes.get(k);
            attr_diff.set(k, { left: left, right: symbol_empty });
            continue;
        }

        const left  = self_attributes.get(k);
        const right = other_attributes.get(k);

        if (!Object.is(left, right)) {
            attr_diff.set(k, { left, right });
        }
    }
    if (attr_diff.size > 0) {
        diff.set("attributes", attr_diff);
    }

    /** @type {ChildNode[]} */
    const self_child_nodes  = [...this.childNodes];
    /** @type {ChildNode[]} */
    const other_child_nodes = [...other.childNodes];
    const children_diff = new Map();
    {
        let i = 0;
        if (self_child_nodes.length < other_child_nodes.length) {
            for (; i < self_child_nodes.length; i++) {
                const left  = self_child_nodes[i];
                const right = other_child_nodes[i];
                const result = Overload.invoke(left, "difference", right);
                if (result != null && !((result instanceof Map) && result.size === 0)) {
                    children_diff.set(String(i), result);
                }
            }
            for (; i < other_child_nodes.length; i++) {
                const right = other_child_nodes[i];
                children_diff.set(String(i), { left: symbol_empty, right: right });
            }
        } else {
            for (; i < other_child_nodes.length; i++) {
                const left  = self_child_nodes[i];
                const right = other_child_nodes[i];
                const result = Overload.invoke(left, "difference", right);
                if (result != null && !((result instanceof Map) && result.size === 0)) {
                    children_diff.set(String(i), result);
                }
            }
            for (; i < self_child_nodes.length; i++) {
                const left = self_child_nodes[i];
                children_diff.set(String(i), { left: left, right: symbol_empty });
            }
        }
        if (children_diff.size > 0) {
            diff.set("children", children_diff);
        }
    }

    return diff.size > 0 ? diff : undefined;
});

Overload.for(Map).define("difference", function(other) {
    if (this === other) { return undefined; }

    const diff = new Map();
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }
    const keys = new Set(this.keys());
    for (const k of other.keys()) {
        keys.add(k);
    }
    const promises = [];
    for (const k of keys) {
        if (!this.has(k)) {
            const right = other.get(k);
            diff.set(k, { left: symbol_empty, right: right });
            continue;
        } else if (!other.has(k)) {
            const left = this.get(k);
            diff.set(k, { left: left, right: symbol_empty });
            continue;
        }

        const left  = this.get(k);
        const right = other.get(k);

        if (left !== null && typeof left === "object") {
            const result = Overload.invoke(left, "difference", right);

            if (result instanceof Promise) {
                promises.push(result.then((result) => {
                    if (result != null) {
                        diff.set(k, result);
                    }
                }));
            } else if (result != null) {
                diff.set(k, result);
            }
        } else if (!Object.is(left, right)) {
            diff.set(k, {left, right});
        }
    }
    return (promises.length > 0) ?
        Promise.all(promises).then(() => (diff.size > 0 ? diff : undefined)) :
        diff.size > 0 ? diff : undefined
    ;
});

Overload.for(Set).define("difference", function(other) {
    if (this === other) { return undefined; }

    const diff = new Map();
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }

    const left_keys  = new Set(this.keys());
    const right_keys = new Set(other.keys());

    for (const k of left_keys) {
        if (!right_keys.has(k)) {
            diff.set(k, { left: k, right: symbol_empty });
        }
    }
    for (const k of right_keys) {
        if (!left_keys.has(k)) {
            diff.set(k, { left: symbol_empty, right: k });
        }
    }

    return diff.size > 0 ? diff : undefined;
});

Overload.for(Number).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }
    const left  = this.valueOf();
    const right = other.valueOf();

    if (!Object.is(left, right)) {
        return { left, right };
    } else {
        return undefined;
    }
});

Overload.for(String).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }
    const left  = this.valueOf();
    const right = other.valueOf();

    if (!Object.is(left, right)) {
        return { left, right };
    } else {
        return undefined;
    }
});

Overload.for(Boolean).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }
    const left  = this.valueOf();
    const right = other.valueOf();

    if (!Object.is(left, right)) {
        return { left, right };
    } else {
        return undefined;
    }
});

Overload.for(Function).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }

    let left  = this?.name;
    if (left == null || left.length === 0) {
        left = String(this);
    }
    let right = other?.name;
    if (right == null || right.length === 0) {
        right = String(other);
    }
    return { left, right };
});

Overload.for(Date).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }
    const left  = this.valueOf();
    const right = other.valueOf();

    if (!Object.is(left, right)) {
        return { left, right };
    } else {
        return undefined;
    }
});

Overload.for(Error).define("difference", function(other) {
    if (this === other) { return undefined; }
    {
        const left  = this.constructor.prototype;
        const right = other?.constructor?.prototype ?? null;
        if (left !== right) {
            const diff = new Map();
            diff.set(symbol_prototype, { left: left, right: right });
            return diff;
        }
    }
    const left  = this.message;
    const right = other.message;

    if (!Object.is(left, right)) {
        return { left, right };
    } else {
        return undefined;
    }
});

Overload.for(Promise).define("difference", function(other) {
    return this.then((value) => {
        return Overload.invoke(value, "difference", other);
    }, (error) => {
        return Overload.invoke(error, "difference", other);
    });
});

/**
 * Gets the shape of the given data.
 * 
 * @param {*} o 
 * A data to be tested.
 * 
 * @param {WeakSet<object>?} refs 
 * A `WeakSet` used for preventing to cause a cyclic reference.
 * 
 * If the `refs` is not provided, this function creates a new `WeakSet` and so in almost every cases
 * it is not needed to pass this argument explicitly.
 * 
 * @returns 
 * a string representing the type of the given data if it is a primitive.
 * an object representing the shape of the given data, otherwise.
 */
const shapeOf = (o, refs) => {
    const refs_ = refs ?? new WeakSet();
    if (o == null) {
        return "undefined";
    }
    const t = typeof o;
    if (t !== "object") {
        return t;
    } else {
        refs_.add(o);

        /**
         * @type {({ [property_name: string]: object })}
         */
        const shape = Object.create(null);
        for (const k in o) {
            if (!Object.prototype.hasOwnProperty.call(o, k)) { continue; }

            const v = o[k];

            shape[k] = refs_.has(v) ? "object" : shapeOf(v, refs_);
        }

        return shape;
    }
}

/**
 * Makes a test scenario.
 * 
 * @param {(...args: any) => any} task 
 * A function representing a test scenario.
 * 
 * @returns 
 * A function returning an object with match functions.
 */
const test = (task) => {
    const print_diff = (difference, formattedTexts, colorDirectives, prefix) => {
        if (difference instanceof Promise) {
            return difference.then(difference => print_diff(difference, formattedTexts, colorDirectives));
        }

        const to_str  = (o) => {
            return (typeof o === "string") ?
                    o :
                (o !== null && typeof o === "object") ?
                    JSON.stringify(o) :
                    String(o)
            ;
        };
        const path_of = (...keys) => {
            const path = [];
            for (const k of keys) {
                if (typeof k === "bigint" || typeof k === "number" || typeof k === "symbol") {
                    path.push("[", to_str(k), "]");
                } else {
                    if (path.length > 0) {
                        path.push(".");
                    }
                    path.push(to_str(k));
                }
            }
            return path.join("");
        };
        const green = "color: hsl(135deg, 100%, 30%);";
        const red   = "color: hsl(-15deg, 100%, 50%);";
        const formatted_text   = formattedTexts  ?? [];
        const color_directives = colorDirectives ?? [];

        if (difference instanceof Map) {
            for (const [k, v] of difference.entries()) {
                const prefix_ = (prefix == null) ? [k] : [...prefix, k];
                if (v instanceof Map) {
                    print_diff(v, formatted_text, color_directives, prefix_);
                } else if (v != null) {
                    const path_ = path_of(...prefix_);
                    formatted_text.push(`%c+ ${path_}: ${to_str(v.left)}`,`%c- ${path_}: ${to_str(v.right)}`);
                    color_directives.push(green, red);
                }
            }
        } else if (difference != null) {
            if (prefix == null) {
                formatted_text.push(`%c+ ${to_str(difference.left)}`,`%c- ${to_str(difference.right)}`);
            } else {
                const path_ = path_of(...prefix);
                formatted_text.push(`%c+ ${path_}: ${to_str(difference.left)}`,`%c- ${path_}: ${to_str(difference.right)}`);
            }
            color_directives.push(green, red);
        }
        if (formattedTexts == null) {
            console.debug(formatted_text.join("\n"), ...color_directives);
        }
    };

    const succeeded_theme = [
        "color: white;",
        "background-color: hsl(135deg, 100%, 25%);",
        "font-weight: bold;",
        "padding: 2px;",
        "border-radius: 0.75rem;"
    ].join("");

    const failed_theme = [
        "color: white;",
        "background-color: hsl(-15deg, 100%, 25%);",
        "font-weight: bold;",
        "padding: 2px;",
        "border-radius: 0.75rem;"
    ].join("");

    const aborted_theme = [
        "color: white;",
        "background-color: hsl(285deg, 100%, 25%);",
        "font-weight: bold;",
        "padding: 2px;",
        "border-radius: 0.75rem;"
    ].join("");

    return async (...args) => {
        const inspect_result = inspect(task)(...args);
        const is_async = (inspect_result instanceof Promise);
        const { value: actual, rejected } = await inspect_result;

        const tag_and_scheme = (succeeded) => {
            return (typeof succeeded !== "boolean") ?
                    [ "ABORTED"  , aborted_theme   ] :
                succeeded ?
                    [ "SUCCEEDED", succeeded_theme ] :
                    [ "FAILED"   , failed_theme    ]
            ;
        };
        const print_group = (succeeded, ...options) => {
            const block = options.pop() ?? (() => void(0));
            const [ tag, scheme ] = tag_and_scheme(succeeded);

            let optional_tags = options.join(": ");
            if (optional_tags.length > 0) {
                optional_tags += ": ";
            }

            console.groupCollapsed(`${task}: ${optional_tags} %c${tag}`, scheme);
            block();
            console.groupEnd();

            return succeeded;
        };
        const print_details = (options) => {
            const descriptions = [];
            const entries      = [];

            entries.push(
                ...Object.entries({
                    task,
                    args,
                    actual,
                    "-   rejected": rejected,
                    "-   is async": is_async,
                })
            );
            if (options != null) {
                entries.push(...Object.entries(options));
            }

            const max_key_len = Math.max(0, ...entries.map(([k, ]) => k.length));

            for (const [k, v] of entries) {
                descriptions.push("\n" + k + " ".repeat(max_key_len - k.length) + ": ", v);
            }

            console.debug(...descriptions);
        };

        /** @type {(Promise<boolean | undefined> | boolean | undefined)[]} */
        const is_passed = [];
        return {
            toBe(expected) {
                if (expected instanceof Promise) {
                    return expected.then(expected => this.toBe(expected));
                }

                const difference = Overload.invoke(actual, "difference", expected);
                const succeeded  = (difference == null);

                print_group(succeeded, () => {
                    print_details({ expected });
                    print_diff(difference);
                });

                is_passed.push(succeeded);

                return this.summary();
            },
            toBeTypedAs(expected) {
                switch (expected) {
                case Number: {
                    return this.satisfies(
                        (actual) => (typeof actual === "number"  || (actual instanceof Number))
                    );
                }
                case Boolean: {
                    return this.satisfies(
                        (actual) => (typeof actual === "boolean" || (actual instanceof Boolean))
                    );
                }
                case String: {
                    return this.satisfies(
                        (actual) => (typeof actual === "string"  || (actual instanceof String))
                    );
                }
                case BigInt: {
                    return this.satisfies(
                        (actual) => (typeof actual === "bigint")
                    );
                }
                case Symbol: {
                    return this.satisfies(
                        (actual) => (typeof actual === "symbol")
                    );
                }
                case null: {
                    return this.satisfies(
                        (actual) => (actual === null)
                    );
                }
                case undefined: {
                    return this.satisfies(
                        (actual) => (actual === undefined)
                    );
                }
                default: {
                    if (typeof expected === "function") {
                        const actual_type = actual?.constructor ?? null;

                        const is_partially_passed = print_group(actual instanceof expected, () => {
                            print_details({ expected, actual_type });
                        });

                        is_passed.push(is_partially_passed);
                    } else {
                        const actual_shape   = shapeOf(actual);
                        const expected_shape = shapeOf(expected);
                        const difference     = Overload.invoke(actual_shape, "difference", expected_shape);

                        const is_partially_passed = (difference == null);

                        print_group(is_partially_passed, () => {
                            print_details({ expected, actual_shape, expected_shape });
                            print_diff(difference);
                        });

                        is_passed.push(is_partially_passed);
                    }

                    return this;
                }
                }
            },
            satisfies(condition) {
                let is_partially_passed = false;
                try {
                    is_partially_passed = condition(actual);
                } catch (e) {
                    is_passed.push(undefined);
                    print_group(undefined, () => {
                        print_details({ errorInCondition: e });
                    });
                    return this;
                }
                if (is_partially_passed instanceof Promise) {
                    is_partially_passed = is_partially_passed.then(
                        x => print_group(x,  () => {
                            print_details({ condition });
                        }),
                        e => print_group(undefined, () => {
                            print_details({ errorInCondition: e });
                        })
                    );

                    is_passed.push(is_partially_passed);
                } else {
                    print_group(is_partially_passed, () => {
                        print_details({ condition });
                    });

                    is_passed.push(is_partially_passed);
                }
                return this;
            },
            summary() {
                if (is_passed.some((result) => (result instanceof Promise))) {
                    return Promise.all(is_passed).then((is_passed) => {
                        return print_group(
                            is_passed.every(partially_passed => partially_passed),
                            () => {
                                for (const i of is_passed.keys()) {
                                    const [ tag, scheme ] = tag_and_scheme(is_passed[i]);
                                    console.debug(`test ${i}: %c${tag}`, scheme);
                                }
                            }
                        );
                    });
                } else {
                    return print_group(
                        is_passed.every(partially_passed => partially_passed),
                        "summary",
                        () => {
                            for (const i of is_passed.keys()) {
                                const [ tag, scheme ] = tag_and_scheme(is_passed[i]);
                                console.debug(`test ${i}: %c${tag}`, scheme);
                            }
                        }
                    );
                }
            }
        };
    }
};

/// Platform Specific -->
export { doTest, TestCase, TestStatus, test };
/// <-- Platform Specific
