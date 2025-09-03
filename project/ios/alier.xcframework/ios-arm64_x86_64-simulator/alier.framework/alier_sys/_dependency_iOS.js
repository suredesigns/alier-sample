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
 * NOTE FOR IMPLEMENTORS:
 * If you add some functionality in this script,
 * you shan't forget add them as properties of the `globalThis.AlierPlatformSpecifics` which is defined at the end of this script.
 */
(() => {
"use strict";
const PLATFORM_NAME = "iOS";

const argsReplacer = (v) => {
    return (typeof v === "boolean") ?
        (v ? "true" : "false") :
        v
    ;
};

/**
 * A delegate of functionCallReceiver() function implemented in the native side.
 * 
 * @param {string} function_name
 * a string representing the target function's name.
 * @param {({type:string,name:string,id:string})} callback_handle 
 * a shared object used for returning the result of invocation of the target function.
 * @param {any[]} args 
 * an array of arguments to be passed to the target function.
 * @returns {void}
 */
function functionDelegate(function_name, callback_handle, args) {
    return webkit.messageHandlers.functionCallReceiver.postMessage({
        function_name: function_name,
        callback_handle: callback_handle,
        args: args.map(argsReplacer)
    });
}

/**
 * A delegate of functionCallReceiverSync() function implemented in the native side.
 * 
 * @param {string} function_name
 * a string representing the target function's name.
 * @param {any[]} args 
 * an array of arguments to be passed to the target function.
 * @returns {string}
 * a JSON string representing a return value from the target function.
 */
function functionDelegateSync(function_name, args) {
    const json = JSON.stringify({
        function_name: function_name,
        args: args.map(argsReplacer)
    });

    const result = prompt(json);

    return result === null ? "\"undefined\"" : result;
}
    
/**
 * Send a message to the Native land.
 * 
 * @param {string} message a string representing the message to be sent.
 * `"default"` is set as the default value.
 */
async function _sendstat(message = "default") {
    return webkit.messageHandlers._recvstat.postMessage(message);
}

/**
 * Load a text file asynchronously from the Native land.
 *
 * @param {string} filepath
 * a string representing the file path.
 * @return {Promise<string>}
 * the loaded text.
 */
async function loadText(filepath) {
    return Alier.Native.loadText(filepath);
}

/**
 * Load a text file synchronously from the Native land.
 * @param {string} filepath
 * a string representing the file path.
 * @return {string}
 * the loaded text.
 */
function loadTextSync(filepath) {
    return Alier.Native.loadTextSync(filepath);
}

globalThis.AlierPlatformSpecifics = {
    functionDelegate: functionDelegate,
    functionDelegateSync: functionDelegateSync,
    _sendstat: _sendstat,
    loadText: loadText,
    loadTextSync: loadTextSync
};
})();
