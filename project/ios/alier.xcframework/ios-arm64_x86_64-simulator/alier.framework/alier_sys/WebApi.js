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

import { Pattern } from "/alier_sys/Pattern.js";
import { WebApiError } from "/alier_sys/WebApiError.js";
import { IAuthAgent } from "/alier_sys/Auth.js";

/**
 * @param {string} s
 */
function _isQuotedString(s) {
    return (s.length >= 2 && s.startsWith("\"") && s.endsWith("\""));
}

/**
 * @return {({ value: string, params: { [param_name: string]: string }?})}
 */
function _nextDesc () {
    return ({ value: "", params: null });
}

function _setDescParam(desc, key, value) {
    if (desc.params == null) {
        desc.params = {};
    }

    if (Object.prototype.hasOwnProperty.call(desc.params, key)) {
        throw new SyntaxError(`Duplicated parameter definition found. ${JSON.stringify(key)} is already defined.`);
    }

    desc.params[key] = (value == null) ?
            "" :
        _isQuotedString(value) ?
            JSON.parse(value) :
            value
    ;

    return desc;
}

/**
 * Tokenizer used in {@link _parseGenericHeaderValue}.
 *
 * @param {IterableIterator<string>} substringIterator
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _tokenizeGenericHeaderValue(substringIterator) {
    const comma      = String.raw`\x2c`;  //  \,
    const semicolon  = String.raw`\x3b`;  //  \;
    const equal      = String.raw`\x3d`;  //  \=
    const rest       = String.raw`[\x21\x23-\x2b\x2d-\x3a\x3c\x3e-\x7e\x80-\xff]+`;

    const token_expr = new RegExp(`${comma}|${semicolon}|${equal}|${rest}`, "g");

    const wsp_expr   = /^[\x09\x20]+$/;

    for (const s of substringIterator) {
        if (_isQuotedString(s) || wsp_expr.test(s)) {
            yield s;
        } else {
            for (const m of s.matchAll(token_expr)) {
                yield m[0];
            }
        }
    }
}
/**
 * @param {IterableIterator<string>} substringIterator
 * An iterator provided from the caller, i.e. {@link parseHeaderValue}.
 * This iterator generates the following types of strings:
 *
 * -  `quoted-string`: a string surrounded with a pair of double quotes.
 * -  `white-space`  : a string composed with horizontal tabs (`\x09`) and/or spaces (`\x20`).
 * -  `token`        : a string does not match both quoted-strings and white-spaces.
 *
 * Any type of strings will not contain control characters except horizontal tabs.
 */
function* _parseGenericHeaderValue(substringIterator) {
    //  field-content = field-value field-params
    //  field-params  = *(OWS ";" OWS param-name "=" param-value)
    //  field-value   = (vchar / obs-text) *(1*(SP / HTAB) (vchar / obs-text))

    const State = Object.freeze({
        /**
         * ```text
         * buf: (*)
         *   OR (value-frag, value-frag / space, ..., value-frag, *)  ;  value-frag = token / "=" / quoted-str
         *
         * |WAIT_VALUE| --> "="        --> |WAIT_VALUE|       (buf --> ("=", *))
         * |WAIT_VALUE| --> ";"        --> (len(buf) > 0) ?
         *                                 |WAIT_PARAM_NAME|  (buf --> (..., token, ";", *))
         *                               : error              (empty value)
         * |WAIT_VALUE| --> ","        --> (len(buf) > 0)
         *                                 |WAIT_VALUE|       (parsed as `field-value`; buf is cleared)
         *                               : error              (empty value)
         * |WAIT_VALUE| --> space      --> (len(buf) > 0) ?
         *                                 |WAIT_VALUE|       (buf --> (..., token, space, *))
         *                               : |WAIT_VALUE|       (whitespace is ignored)
         * |WAIT_VALUE| --> token      --> |WAIT_VALUE|       (buf --> (..., token, *))
         * |WAIT_VALUE| --> quoted-str --> |WAIT_VALUE|       (buf --> (..., quoted-str, *))
         * |WAIT_VALUE| --> end        --> (len(buf) > 0)
         *                                 |WAIT_VALUE|       (parsed as `field-value`)
         *                               : error              (empty value)
         * ```
         */
        WAIT_VALUE                 : 0x00,
        /**
         * ```text
         * buf: (..., ";", *)
         *
         * |WAIT_PARAM_NAME| --> "="        --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> ";"        --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> ","        --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> space      --> |WAIT_PARAM_NAME|    (whitespace is ignored)
         * |WAIT_PARAM_NAME| --> token      --> |WAIT_PARAM_KV_SEP|  (buf --> (..., ";", token, *))
         * |WAIT_PARAM_NAME| --> quoted-str --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> end        --> error                (token is expected)
         * ```
         */
        WAIT_PARAM_NAME            : 0x01,
        /**
         * ```text
         * buf: (..., ";", token, *)
         *
         * |WAIT_PARAM_KV_SEP| --> "="        --> |WAIT_PARAM_VALUE|   (buf --> (..., ";", token, "=", *))
         * |WAIT_PARAM_KV_SEP| --> ";"        --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> ","        --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> space      --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> token      --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> quoted-str --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> end        --> error                ("=" is expected)
         * ```
         */
        WAIT_PARAM_KV_SEP          : 0x02,
        /**
         * ```text
         * buf: (..., ";", token, "=", *)
         *   OR (..., ";", token, "=", token-frag, ..., token-frag, *);  token-frag = token / "="
         *
         * |WAIT_PARAM_VALUE| --> "="        --> |WAIT_PARAM_VALUE|             (buf --> (..., "=", [...], "=", *))
         * |WAIT_PARAM_VALUE| --> ";"        --> ( count(token-frag) > 0 ) ?
         *                                       |WAIT_PARAM_NAME|              (buf --> (..., "=", token-frag, ..., token-frag,  ";", *))
         *                                     : error                          (token / quoted-str is expected)
         * |WAIT_PARAM_VALUE| --> ","        --> ( count(token-frag) > 0 ) ?
         *                                       |WAIT_VALUE|                   (parsed as `field-value field-params`; buf is cleared)
         *                                     : error                          (token / quoted-str is expected)
         * |WAIT_PARAM_VALUE| --> space      --> ( count(token-frag) > 0 ) ?
         *                                       |WAIT_VALUE_SEP_OR_PARAM_SEP|  (buf --> (..., "=", token-frag + ... + token-frag, space, *))
         *                                     : error                          (token / quoted-str is expected)
         * |WAIT_PARAM_VALUE| --> token      --> |WAIT_PARAM_VALUE|             (buf --> (..., ";", token, "=", [...], token, *))
         * |WAIT_PARAM_VALUE| --> quoted-str --> ( count(token-frag) > 0 ) ?
         *                                       error                          (token / ";" / "," / "=" is expected)
         *                                     : |WAIT_VALUE_SEP_OR_PARAM_SEP|  (buf --> (..., ";", token, "=", quoted-str, *))
         * |WAIT_PARAM_VALUE| --> end        --> ( count(token-frag) > 0 ) ?
         *                                       return                         (parsed as `field-value field-params`)
         *                                     : error                          (token /quoted-str is expected)
         * ```
         */
        WAIT_PARAM_VALUE           : 0x03,
        /**
         * ```text
         * buf: (..., ";", token, "=", token, *)
         *
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> "="        --> error                          (";" / "," is expected)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> ";"        --> |WAIT_PARAM_NAME|              (buf --> (..., ";" token, "=", token, ";", *))
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> ","        --> |WAIT_VALUE|                   (parsed as `field-value field-params`; buf is cleared)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> space      --> |WAIT_VALUE_SEP_OR_PARAM_SEP|  (whitespace is ignored)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> token      --> error                          (";" / "," is expected)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> quoted-str --> error                          (";" / "," is expected)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> end        --> return                         (parsed as `field-value field-params`)
         * ```
         */
        WAIT_VALUE_SEP_OR_PARAM_SEP: 0x04,
    });

    const is_wsp      = (s) => /^[\x09\x20]/.test(s);  //  exact match is not needed because other tokens are not starting with whitespaces.

    let   state       = State.WAIT_VALUE;
    const token_frags = [];
    let   desc        = _nextDesc();

    for (const token of _tokenizeGenericHeaderValue(substringIterator)) {
        switch (state) {
        case State.WAIT_VALUE:
        {
            if (token === "=") {
                token_frags.push(token);
            } else if (token === ";") {
                if (token_frags.length === 0) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. field-value is empty.`);
                }

                while (token_frags.length > 0 && is_wsp(token_frags[token_frags.length - 1])) {
                    token_frags.pop();
                }
                desc.value = token_frags.splice(0, token_frags.length).join("");

                state      = State.WAIT_PARAM_NAME;
            } else if (token === ",") {
                if (token_frags.length === 0) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. field-value is empty.`);
                }

                while (token_frags.length > 0 && is_wsp(token_frags[token_frags.length - 1])) {
                    token_frags.pop();
                }
                desc.value = token_frags.splice(0, token_frags.length).join("");

                yield desc;

                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                if (token_frags.length > 0) {
                    token_frags.push(token);
                }
            } else {
                token_frags.push(token);
            }
        }
        break;
        case State.WAIT_PARAM_NAME:
        {
            if (token === "=" || token === ";" || token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                token_frags.push(token);
                state = State.WAIT_PARAM_KV_SEP;
            }
        }
        break;
        case State.WAIT_PARAM_KV_SEP:
        {
            if (token === "=") {
                state = State.WAIT_PARAM_VALUE;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            }
        }
        break;
        case State.WAIT_PARAM_VALUE:
        {
            if (token === "=") {
                token_frags.push(token);
            } else if (token === ";") {
                if (token_frags.length <= 1) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. param-value is empty.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token_frags.splice(0, token_frags.length).join("");

                _setDescParam(desc, param_name, param_value);

                state = State.WAIT_PARAM_NAME;
            } else if (token === ",") {
                if (token_frags.length <= 1) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. param-value is empty.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token_frags.splice(0, token_frags.length).join("");

                _setDescParam(desc, param_name, param_value);

                yield desc;
                desc = _nextDesc(desc);

                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                if (token_frags.length <= 1) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. param-value is empty.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token_frags.splice(0, token_frags.length).join("");

                _setDescParam(desc, param_name, param_value);

                state = State.WAIT_VALUE_SEP_OR_PARAM_SEP;
            } else if (_isQuotedString(token)) {
                if (token_frags.length >= 2) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. quoted-string is not allowed here.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token;

                _setDescParam(desc, param_name, param_value);

                state = State.WAIT_VALUE_SEP_OR_PARAM_SEP;
            } else {
                token_frags.push(token);
            }
        }
        break;
        case State.WAIT_VALUE_SEP_OR_PARAM_SEP:
        {
           if (token === ";") {
                state = State.WAIT_PARAM_NAME;
            } else if (token === ",") {
                yield desc;

                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                continue;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. separator for field-values or field-contents are expected.`);
            }
        }
        break;
        default:
            throw new Error("UNREACHABLE");
        }
    }

    switch (state) {
    case State.WAIT_VALUE:
    {

        if (token_frags.length === 0) {
            throw new SyntaxError("Unexpected token appeared. field-value is empty.");
        }

        while (token_frags.length > 0 && is_wsp(token_frags[token_frags.length - 1])) {
            token_frags.pop();
        }
        desc.value = token_frags.splice(0, token_frags.length).join("");

        yield desc;
    }
    break;
    case State.WAIT_PARAM_NAME:
    {
        throw new SyntaxError("Incomplete field was given. vchars with no delimiters is expected.");
    }
    case State.WAIT_PARAM_KV_SEP:
    {
        throw new SyntaxError("Incomplete field was given. key-value separator is expected.");
    }
    case State.WAIT_PARAM_VALUE:
    {
        if (token_frags.length <= 1) {
            throw new SyntaxError("Incomplete field was given. vchars with no delimiters or quoted-string are expected.");
        }

        const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
        const param_value = token_frags.splice(0, token_frags.length).join("");

        _setDescParam(desc, param_name, param_value);

        yield desc;
    }
    break;
    case State.WAIT_VALUE_SEP_OR_PARAM_SEP:
    {
        yield desc;
    }
    break;
    default:
        throw new Error("UNREACHABLE");
    }
}


/**
 * Tokenizer used in {@link _parseCredentialsListHeader}.
 *
 * @param {IterableIterator<string>} substringIterator
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _tokenizeCredentialsList(substringIterator) {
    const comma      = String.raw`\x2c`;  //  \,
    const equal      = String.raw`\x3d`;  //  \=
    const rest       = String.raw`[\x21\x23-\x2b\x2d-\x3c\x3e-\x7e\x80-\xff]+`;

    const token_expr = new RegExp(`${comma}|${equal}|${rest}`, "g");
    const wsp_expr   = /^[\x09\x20]+$/;

    for (const s of substringIterator) {
        if (_isQuotedString(s) || wsp_expr.test(s)) {
            yield s;
        } else {
            for (const m of s.matchAll(token_expr)) {
                yield m[0];
            }
        }
    }
}

/**
 * @param {IterableIterator<string>} substringIterator
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _parseCredentialsListHeader(substringIterator) {
    //  token68     =   1*( ALPHA / DIGIT /
    //                      "-" / "." / "_" / "~" / "+" / "/" ) *"="
    //  auth-scheme =   token
    //  SP          =   \x20
    //  HTAB        =   \x09
    //  BWS         =   OWS              #   "Bad" White-Space.
    //  OWS         =   *[ SP / HTAB ]   #   Optional White-Space
    //  auth-param  =   token BWS "=" BWS ( token / quoted-string )
    //  credentials =   auth-scheme [ 1*SP ( token68 / #auth-param ) ]

    const State = Object.freeze({
        /**
         * ```text
         * buf: (*)
         *
         * |WAIT_VALUE| --> ","        --> error
         * |WAIT_VALUE| --> "="        --> error
         * |WAIT_VALUE| --> space      --> |WAIT_VALUE|  (whitespace is ignored)
         * |WAIT_VALUE| --> quoted-str --> error
         * |WAIT_VALUE| --> token      --> |WAIT_SPACE|  (buf --> (token, *))
         * |WAIT_VALUE| --> end        --> error
         * ```
         */
        WAIT_VALUE                  : 0x00,
        /**
         * ```text
         * buf: (token, *)
         *
         * |WAIT_SPACE| --> "="        --> error
         * |WAIT_SPACE| --> ","        --> |WAIT_VALUE|                  (parsed as `auth-scheme`; buf is cleared)
         * |WAIT_SPACE| --> space      --> |WAIT_TOKEN68_OR_PARAM_NAME|  (buf --> (token, space, *))
         * |WAIT_SPACE| --> quoted-str --> error
         * |WAIT_SPACE| --> token      --> error
         * |WAIT_SPACE| --> end        --> return                        (parsed as `auth-scheme`)
         * ```
         */
        WAIT_SPACE                  : 0x01,
        /**
         * ```text
         * buf: (token, space, *)
         *
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> "="        --> error
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> ","        --> |WAIT_VALUE|                    (parsed as `auth-scheme`; buf is cleared)
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> space      --> |WAIT_TOKEN68_OR_PARAM_NAME|    (whitespace is ignored)
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> quoted-str --> error
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> token      --> |WAIT_PADDING_OR_PARAM_KV_SEP|  (buf --> (token, space, token, *))
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> end        --> return                          (parsed as `auth-scheme`)
         * ```
         */
        WAIT_TOKEN68_OR_PARAM_NAME  : 0x02,
        /**
         * ```text
         * buf: (token, space, token, *)
         *
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> "="        --> |WAIT_PADDING_OR_PARAM_VALUE|  (buf --> (token, space, token, "="))
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> ","        --> |WAIT_VALUE|                   (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> space      --> |WAIT_PARAM_KV_SEP|            (state is changed but whitespace is ignored)
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> quoted-str --> error
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> token      --> error
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> end        --> return                         (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PADDING_OR_PARAM_KV_SEP: 0x03,
        /**
         * ```text
         * buf: (token, space, token, "=", *)
         *
         * |WAIT_PADDING_OR_PARAM_VALUE| --> "="        --> |WAIT_PADDING|      (buf --> (token, space, token + "=" + "=", *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> ","        --> |WAIT_VALUE|        (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_PADDING_OR_PARAM_VALUE| --> space      --> |WAIT_VALUE_SEP|    (buf --> (token, space, token + "=", *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> quoted-str --> |WAIT_VALUE_SEP|    (buf --> (token, space, token + "=" + quoted-str, *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> token      --> |WAIT_VALUE_SEP|    (buf --> (token, space, token + "=" + token, *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> end        --> return              (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PADDING_OR_PARAM_VALUE : 0x04,
        /**
         * ```text
         * buf: (token, space, token68, *)
         *
         * |WAIT_PADDING| --> "="        --> |WAIT_PADDING|      (buf --> (token, space, token68 + "=", *))
         * |WAIT_PADDING| --> ","        --> |WAIT_VALUE|        (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_PADDING| --> space      --> |WAIT_VALUE_SEP|    (buf --> (token, space, token68, *))
         * |WAIT_PADDING| --> quoted-str --> error
         * |WAIT_PADDING| --> token      --> error
         * |WAIT_PADDING| --> end        --> return              (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PADDING                : 0x05,
        /**
         * ```text
         * buf: (token, space, token, *)
         *   OR (token, space, (auth-param, ","), ..., token, *)
         *
         * |WAIT_PARAM_KV_SEP| --> "="        --> |WAIT_PARAM_VALUE|   (buf --> (token, space, token, "=", *))
         * |WAIT_PARAM_KV_SEP| --> ","        --> ( count(auth-param) >= 1 ) ?
         *                                        |WAIT_VALUE|         (parsed as `auth-scheme SP #auth-param`
         *                                                              and then parsed as `auth-scheme`
         *                                                              ; buf is cleared)
         *                                      : |WAIT_VALUE|         (parsed as `auth-scheme SP token68`
         *                                                              ; buf is cleared)
         * |WAIT_PARAM_KV_SEP| --> space      --> |WAIT_PARAM_KV_SEP|
         * |WAIT_PARAM_KV_SEP| --> quoted-str --> error                (the last item cannot be concatenated with other tokens/quoted-strs)
         * |WAIT_PARAM_KV_SEP| --> token      --> error                (the last item cannot be concatenated with other tokens/quoted-strs)
         * |WAIT_PARAM_KV_SEP| --> end        --> ( count(auth-param) >= 1 ) ?
         *                                        return               (parsed as `auth-scheme SP #auth-param`
         *                                                              and then parsed as `auth-scheme`)
         *                                      : return               (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PARAM_KV_SEP           : 0x10,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., token, "=", *)
         *   OR (token, space, token, "=", *)
         *
         * |WAIT_PARAM_VALUE| --> "="           --> error                   (invalid token)
         * |WAIT_PARAM_VALUE| --> ","           --> error                   (missing a param-value for an auth-param)
         * |WAIT_PARAM_VALUE| --> space         --> |WAIT_PARAM_VALUE|      (whitespace is ignored)
         * |WAIT_PARAM_VALUE| --> quoted-str    --> |WAIT_VALUE_SEP|        (buf --> (..., token, "=", quoted-str, *))
         * |WAIT_PARAM_VALUE| --> token         --> |WAIT_VALUE_SEP|        (buf --> (..., token, "=", token, *))
         * |WAIT_PARAM_VALUE| --> end           --> error                   (missing a param-value for an auth-param)
         * ```
         */
        WAIT_PARAM_VALUE            : 0x11,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., auth-param, *)
         *   OR (token, space, token68, *)
         *
         * |WAIT_VALUE_SEP| --> "="        --> error
         * |WAIT_VALUE_SEP| --> ","        --> ( buf.endsWith(auth-param) ) ?
         *                                     |WAIT_VALUE_OR_PARAM|  (buf --> (token, space, ..., auth-param, ",", *))
         *                                   : |WAIT_VALUE|           (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_VALUE_SEP| --> space      --> |WAIT_VALUE_SEP|       (whitespace is ignored)
         * |WAIT_VALUE_SEP| --> quoted-str --> error
         * |WAIT_VALUE_SEP| --> token      --> error
         * |WAIT_VALUE_SEP| --> end        --> return
         * ```
         */
        WAIT_VALUE_SEP              : 0x20,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., auth-param, ",", *)
         *
         * |WAIT_VALUE_OR_PARAM| --> "="        --> error
         * |WAIT_VALUE_OR_PARAM| --> ","        --> error
         * |WAIT_VALUE_OR_PARAM| --> space      --> |WAIT_VALUE_OR_PARAM|   (whitespace is ignored)
         * |WAIT_VALUE_OR_PARAM| --> quoted-str --> error
         * |WAIT_VALUE_OR_PARAM| --> token      --> |WAIT_SPACE_OR_KV_SEP|  (buf --> (token, space, (auth-param, ","), ..., token, *))
         * |WAIT_VALUE_OR_PARAM| --> end        --> error
         * ```
         */
        WAIT_VALUE_OR_PARAM         : 0x30,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., token, *)
         *
         * |WAIT_SPACE_OR_KV_SEP| --> "="        --> |WAIT_PARAM_VALUE|        (buf --> (..., "," token, "=", *))
         * |WAIT_SPACE_OR_KV_SEP| --> ","        --> |WAIT_VALUE|              (parsed as `token SP #auth-param` and then as `token`; buf is cleared)
         * |WAIT_SPACE_OR_KV_SEP| --> space      --> |WAIT_TOKEN68_OR_KV_SEP|  (buf --> (..., "," token, space, *))
         * |WAIT_SPACE_OR_KV_SEP| --> quoted-str --> error
         * |WAIT_SPACE_OR_KV_SEP| --> token      --> error
         * |WAIT_SPACE_OR_KV_SEP| --> end        --> return                    (parsed as `token SP #auth-param` and then as `token`)
         * ```
         */
        WAIT_SPACE_OR_KV_SEP        : 0x31,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., token, space, *)
         *
         * |WAIT_TOKEN68_OR_KEY_SEP| --> "="        --> |WAIT_PARAM_VALUE|              (the last whitespace is ignored;  buf --> (..., "," token, "=", *))
         * |WAIT_TOKEN68_OR_KEY_SEP| --> ","        --> error                           (invalid token)
         * |WAIT_TOKEN68_OR_KEY_SEP| --> space      --> |WAIT_TOKEN68_OR_KV_SEP|        (whitespace is ignored)
         * |WAIT_TOKEN68_OR_KEY_SEP| --> quoted-str --> error
         * |WAIT_TOKEN68_OR_KEY_SEP| --> token      --> |WAIT_PADDING_OR_PARAM_KV_SEP|  (parse buf excluding the last 2 components as `token SP #auth-param`,
         *                                                                               and then buf --> (token, space, token, *))
         * |WAIT_TOKEN68_OR_KEY_SEP| --> end        --> return                          (parsed as `token SP #auth-param`
         *                                                                               and then as `token`)
         * ```
         */
        WAIT_TOKEN68_OR_KV_SEP      : 0x32,
    });

    const wsp_expr   = /^[\x09\x20]/;  //  exact match is not needed because other tokens are not starting with whitespaces.
    const is_wsp     = (s) => wsp_expr.test(s);

    let   state =  State.WAIT_VALUE;
    /**
     * @type {string[]}
     */
    const token68_or_param = [];

    /**
     * @param {({ value: string, params: ({ [param_name: string]: string })?})} desc
     */
    const split_scheme_and_token68 = (desc) => {
        const [ scheme, token68 ] = desc.value.split(" ");

        _setDescParam(desc, "scheme", scheme.toLowerCase());    // scheme matches case-insensitively.
        if (typeof token68 === "string" && token68.length > 0) {
            _setDescParam(desc, "token68", token68);
        }
        return desc;
    };

    let desc  = _nextDesc();
    for (const token of _tokenizeCredentialsList(substringIterator)) {
        switch(state) {
        case State.WAIT_VALUE:
        {
            if (token === "=" || token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                desc.value = token;
                state = State.WAIT_SPACE;
            }
        }
        break;
        case State.WAIT_SPACE:
        {
            if (is_wsp(token)) {
                state = State.WAIT_TOKEN68_OR_PARAM_NAME;
            } else if (token === ",") {
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. whitespace is expected.`);
            }
        }
        break;
        case State.WAIT_TOKEN68_OR_PARAM_NAME:
        {
            if (token === "=" || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. token68 or param-name are expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else if (token === ",") {
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else {
                token68_or_param.push(token);
                state = State.WAIT_PADDING_OR_PARAM_KV_SEP;
            }
        }
        break;
        case State.WAIT_PADDING_OR_PARAM_KV_SEP:
        {
            if (token === "=") {
                token68_or_param.push(token);
                state = State.WAIT_PADDING_OR_PARAM_VALUE;
            } else if (token === ",") {
                if (token68_or_param.length > 0) {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                }
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                state = State.WAIT_PARAM_KV_SEP;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. token68 or param-name are expected.`);
            }
        }
        break;
        case State.WAIT_PADDING_OR_PARAM_VALUE:
        {
            if (token === "=") {
                token68_or_param.push(token);
                state = State.WAIT_PADDING;
            } else if (token === ",") {
                if (token68_or_param.length > 0) {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                }
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                if (token68_or_param.length > 0) {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                }
                state = State.WAIT_VALUE_SEP;
            } else {
                const param_name = token68_or_param.splice(0, token68_or_param.length)[0];
                _setDescParam(desc, param_name, token);
                state = State.WAIT_VALUE_SEP;
            }
        }
        break;
        case State.WAIT_PADDING:
        {
            if (token === "=") {
                token68_or_param.push(token);
            } else if (token === ",") {
                desc.value += " ";
                desc.value += token68_or_param.splice(0, token68_or_param.length).join("");

                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();

                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                desc.value += " ";
                desc.value += token68_or_param.splice(0, token68_or_param.length).join("");

                state = State.WAIT_VALUE_SEP;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. padding in a token68 is expected.`);
            }
        }
        break;
        case State.WAIT_PARAM_KV_SEP:
        {
            if (token === "=") {
                token68_or_param.push(token);

                state = State.WAIT_PARAM_VALUE;
            } else if (token === ",") {
                if (desc.params != null) {
                    yield split_scheme_and_token68(desc);
                    desc  = _nextDesc();

                    desc.value = token68_or_param.splice(0, token68_or_param.length).join("")
                    yield split_scheme_and_token68(desc);
                    desc  = _nextDesc();

                    state = State.WAIT_VALUE;
                } else {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                    yield split_scheme_and_token68(desc);
                    desc  = _nextDesc();

                    state = State.WAIT_VALUE;
                }
            } else if (is_wsp(token)) {
                continue;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. key-value separator is expected.`);
            }
        }
        break;
        case State.WAIT_PARAM_VALUE:
        {
            if (token === "=" || token === ",") {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters or quoted-string are expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                const param_name = token68_or_param.splice(0, token68_or_param.length)[0];

                _setDescParam(desc, param_name, token);

                state = State.WAIT_VALUE_SEP;
            }
        }
        break;
        case State.WAIT_VALUE_SEP:
        {
            if (token === ",") {
                if (desc.params != null) {
                    state = State.WAIT_VALUE_OR_PARAM;
                } else {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");

                    yield split_scheme_and_token68(desc);

                    desc = _nextDesc();
                    state = State.WAIT_VALUE;
                }
            } else if (is_wsp(token)) {
                continue;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. separator of values / key-value pairs is expected.`);
            }
        }
        break;
        case State.WAIT_VALUE_OR_PARAM:
        {
            if (token === "=" || token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                token68_or_param.push(token);
                state = State.WAIT_SPACE_OR_KV_SEP;
            }
        }
        break;
        case State.WAIT_SPACE_OR_KV_SEP:
        {
            if (token === "=") {
                state = State.WAIT_PARAM_VALUE;
            } else if (token === ",") {
                yield split_scheme_and_token68(desc);
                desc = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                state = State.WAIT_TOKEN68_OR_KV_SEP;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. whitespace or key-value separator are expected.`);
            }
        }
        break;
        case State.WAIT_TOKEN68_OR_KV_SEP:
        {
            if (token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters or key-value separator are expected.`);
            } else if (token === "=") {
                state = State.WAIT_PARAM_VALUE;
            } else if (is_wsp(token)) {
                continue;
            } else {
                yield split_scheme_and_token68(desc);
                desc = _nextDesc();
                desc.value = token68_or_param.splice(0, token68_or_param.length).join("");
                token68_or_param.push(token);
                state = State.WAIT_PADDING_OR_PARAM_KV_SEP;
            }
        }
        break;
        default:
            throw new Error("UNREACHABLE");
        }
    }
    switch (state) {
    case State.WAIT_VALUE:
    case State.WAIT_VALUE_OR_PARAM:
    {
        throw new SyntaxError("Incomplete field was given. vchars with no delimiters is expected.");
    }
    case State.WAIT_PARAM_VALUE:
    {
        throw new SyntaxError("Incomplete field was given. vchars with no delimiters or quoted-string are expected.");
    }
    case State.WAIT_SPACE:
    case State.WAIT_TOKEN68_OR_PARAM_NAME:
    {
        yield split_scheme_and_token68(desc);
    }
    break;
    case State.WAIT_PADDING_OR_PARAM_KV_SEP:
    case State.WAIT_PADDING_OR_PARAM_VALUE:
    case State.WAIT_PADDING:
    {
        desc.value += " ";
        desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
        yield split_scheme_and_token68(desc);
    }
    break;
    case State.WAIT_PARAM_KV_SEP:
    {
        if (desc.params != null) {
            yield split_scheme_and_token68(desc);
            desc = _nextDesc();
            desc.value = token68_or_param.splice(0, token68_or_param.length).join("");
            yield split_scheme_and_token68(desc);
        } else {
            desc.value += " ";
            desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
            yield split_scheme_and_token68(desc);
        }
    }
    break;
    case State.WAIT_VALUE_SEP:
    {
        if (desc.params != null) {
            yield split_scheme_and_token68(desc);
        } else {
            desc.value += " ";
            desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
            yield split_scheme_and_token68(desc);
        }
    }
    break;
    case State.WAIT_SPACE_OR_KV_SEP:
    case State.WAIT_TOKEN68_OR_KV_SEP:
    {
        yield split_scheme_and_token68(desc);
        desc = _nextDesc();
        desc.value = token68_or_param.splice(0, token68_or_param.length).join("");
        yield split_scheme_and_token68(desc);
    }
    break;
    default:
        throw new Error("Unexpected error");
    }
}

/**
 * @param {IterableIterator<string>} substringIterator
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _parseCredentialsHeader(substringIterator) {
    yield _parseCredentialsListHeader(substringIterator).next().value;
}

/**
 * @param {IterableIterator<string>} substringIterator
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _parseSingleValuedHeader(substringIterator) {
    const desc = _nextDesc();
    desc.value = [...substringIterator].join("");
    yield desc;
}

const ParseHeaderSpecializations = new Map(Object.entries({
    //  authorization    = credentials
    "authorization"   : _parseCredentialsHeader,
    //  www-authenticate = #challenge
    //  NOTE: credentials and challenge have common syntax: token [1*SP (token68 / #auth-param )]
    "www-authenticate": _parseCredentialsListHeader,
    "user-agent"      : _parseSingleValuedHeader
}));

function* parseHeaderValue(headerName, headerValue) {
    const header_name  = headerName;
    const header_value = headerValue;

    if (typeof header_name !== "string") {
        throw new TypeError(`${header_name} is not a string`);
    } else if (typeof header_value !== "string") {
        throw new TypeError(`${header_value} is not a string`);
    }

    const unused     = String.raw`[\x00-\x08\x0a-\x1f\x7f]+`;
    const spaces     = String.raw`[\x09\x20]+`;
    const qstring    = String.raw`\x22(?:\\\x22|[^\x22])*\x22`;
    const rest       = String.raw`[\x21\x23-\x7e\x80-\xff]+`;

    const token_expr = new RegExp(`${unused}|${spaces}|${qstring}|${rest}`, "g");

    const is_bad_qstring = (s) => /[\x00-\x08\x0a-\x1f\x7f]/.test(s);
    const parser = (
        ParseHeaderSpecializations.get(header_name.toLowerCase()) ??
        _parseGenericHeaderValue
    );
    const substr_iter = function* () {
        let next_index = 0;
        for (const m of header_value.matchAll(token_expr)) {
            const index = m.index;

            if (next_index !== index) {
                const skipped_token = header_value.slice(next_index, index);
                throw new SyntaxError(`Unexpected token ${JSON.stringify(skipped_token)} appeared.`)
            }

            const token = m[0];
            const code = token.charCodeAt(0);

            if (code === 0x7f || (code !== 0x09 && code < 0x20) || (code == 0x22 && is_bad_qstring(token))) {
                // unused character detected
                throw new SyntaxError(`${JSON.stringify(token)} is not allowed to be appeared in HTTP headers`);
            } else {
                yield token;
            }

            next_index = m.index + token.length;
        }
    };

    yield* parser(substr_iter());
}

function parseHeader(header) {
    if (typeof header !== "string") {
        throw new TypeError(`${header} is not a string`);
    }

    const spaces     = String.raw`(?:[\x09\x20]|\r\n)+`;
    const qstring    = String.raw`\"(?:\\\"|[^\"])*\"`;
    const colon      = String.raw`\x3a`;  //  \:
    const rest       = String.raw`[\x21\x23-\x39\x3b-\x7e\x80-\xff]+`;

    const token_expr = new RegExp(`${colon}|${spaces}|${qstring}|${rest}`, "g");

    const header_desc = {
        name : "",
        value: ""
    };

    {
        const match_iter = header.matchAll(token_expr);
        const space_expr = /^[\x09\x20]/;
        /**
         * @type {RegExpExecArray | undefined}
         */
        let m = match_iter.next()?.value;
        let next_index = 0;
        let token = "";
        while (m != null) {
            const index = m.index;
            token = m[0];
            if (next_index != index) {
                const skipped_token = header.slice(next_index, index);
                throw new SyntaxError(`Unexpected token ${JSON.stringify(skipped_token)} appeared. This should not appear here.`);
            } else if (token !== ":" && header_desc.name.length > 0) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared.`);
            } else if (_isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. quoted-string is not allowed to be a field-name.`);
            } else if (token === ":") {
                header_desc.value = header.slice(index + 1);
                break;
            } else if (!space_expr.test(token)) {
                header_desc.name = token;
            }
            next_index = index + token.length;
            m = match_iter.next()?.value;
        }
        if (token !== ":") {
            throw new SyntaxError("name-value separator did not appear.");
        }
    }
    if (header_desc.name.length === 0) {
        throw new SyntaxError("field-name is empty");
    }
    const { name: header_name, value: header_value } = header_desc;
    return { name: header_name, values: [...parseHeaderValue(header_name, header_value)] };
}

/**
 * @type {Set<"GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "PATCH">}
 */
const MethodList = new Set([
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "DELETE",
    "OPTIONS",
    "PATCH"
]);

/**
 * @type {Set<"method" | "url" | "headers" | "body">}
 */
const ReservedRequestPropertyNames = new Set([
    "method",
    "url",
    "headers",
    "body"
]);


class WebApi {


    get path() {
        return this.#path;
    }

    get host() {
        return this.#host;
    }

    /**
     * @constructor
     *
     * @param {object} o
     * @param {string} o.path
     * A string representing path part of the URL of the target API.
     *
     * @param {string} o.host
     * A string representing the origin of the URL of the target API.
     *
     * @param {IAuthAgent?} o.authAgent
     * An object used for authentication process or `null`.
     *
     */
    constructor(o) {
        if (o === null || typeof o !== "object") {
            throw new TypeError(`${o} is not a non-null object`);
        }

        const   path_        = o.path,
                host_        = o.host,
                auth_agent_ = o.authAgent
        ;

        if (typeof path_ !== "string") {
            throw new TypeError(`${path_} is not a string`);
        } else if (typeof host_ !== "string") {
            throw new TypeError(`${host_} is not a string`);
        } else if (!(auth_agent_ == null || auth_agent_ instanceof IAuthAgent)) {
            throw new TypeError(`${auth_agent_} does not inherit IAuthAgent`);
        }

        this.#path        = new Pattern({ pattern: path_ });
        this.#host        = host_;
        this.#auth_agent = auth_agent_ ?? null;
    }

    async get(params) {
        return this.do("GET", params);
    }

    async put(params) {
        return this.do("PUT", params);
    }

    async post(params) {
        return this.do("POST", params);
    }

    async delete(params) {
        return this.do("DELETE", params);
    }

    async head(params) {
        return this.do("HEAD", params);
    }

    async options(params) {
        return this.do("OPTIONS", params);
    }

    async patch(params) {
        return this.do("PATCH", params);
    }

    /**
     * Makes an object from the given set of request parameters.
     *
     * @param {"GET" | "PUT" | "POST" | "DELETE" | "HEAD" | "OPTIONS" | "PATCH" } method
     * a string representing an HTTP method to be requested.
     *
     * @param {({ [param_name: string] : any })} params
     * a set of pairs of parameter names and parameter values of the request.
     * @returns a plain object having the target URL, the request body, the request headers and fetch options.
     */
    makeRequest(method, params) {
        /**
         * a set of pairs of header names and header values.
         * @type {({ [header_name: string]: string })}
         */
        const headers_ = {};
        /**
         * @type {(
         *  {
         *      cache         : "default"                         |
         *                      "no-store"                        |
         *                      "reload"                          |
         *                      "force-cache"                     |
         *                      "only-if-cached"                  ,
         *      credentials   : "omit"                            |
         *                      "same-origin"                     |
         *                      "include"                         ,
         *      integrity     : string                            ,
         *      keepalive     : boolean                           ,
         *      mode          : "same-origin"                     |
         *                      "cors"                            |
         *                      "no-cors"                         |
         *                      "navigate"                        |
         *                      "websocket"                       ,
         *      priority      : "high"                            |
         *                      "low"                             |
         *                      "auto"                            ,
         *      redirect      : "follow"                          |
         *                      "error"                           |
         *                      "manual"                          ,
         *      referrer      : string                            ,
         *      referrerPolicy: "no-referrer"                     |
         *                      "no-referrer-when-downgrade"      |
         *                      "same-origin"                     |
         *                      "origin"                          |
         *                      "origin-when-cross-origin"        |
         *                      "strict-origin"                   |
         *                      "strict-origin-when-cross-origin" |
         *                      "unsafe-url"                      ,
         *  }
         * )}
         */
        const fetch_options_ = {};

        const no_payload     = (m) => new Set(["GET", "DELETE", "HEAD", "OPTIONS"]).has(m);
        const query          = new URLSearchParams();
        const path_params    = {};
        const payload        = no_payload(method) ? null : {};

        for (const param_name in params) {
            if (!Object.prototype.hasOwnProperty.call(params, param_name)) { continue; }

            const param = params[param_name];

            if (this.path.has(param_name)) {
                path_params[param_name] = encodeURIComponent(param);
            } else if (payload === null) {
                //  if either one of GET / DELETE / HEAD / OPTIONS method is to be invoked, then the parameters are mapped into a query
                //  each of parameters is serialized as JSON, so it must be parsed as JSON on the opposing server.
                //  It'll be done in the Alier framework for Node.js.
                query.set(param_name, JSON.stringify(param));
            } else {
                //  if either one of PUT / POST / PATCH method is to be invoked, then the parameters are mapped into a body
                payload[param_name] = param;
            }
        }

        const query_count = query.size ?? (() => {
            //  URLSearchParams.size is not implemented before Safari 16.x
            let count = 0;
            query.forEach(() => count++);
            return count;
        })();
        const path_ = this.path.map(path_params).trim().replace(/^\/+/g, "");
        const url_  = `${this.host}/${path_}` + (query_count > 0 ? "?" + query.toString() : "");
        let   body_ = null;

        if (payload != null) {
            // request has body
            if (!Object.prototype.hasOwnProperty.call(headers_, "content-type")) {
                headers_["content-type"] = "application/json";
            }
            const content_types = [...parseHeaderValue("content-type", headers_["content-type"].toLowerCase())];
            const content_type  = content_types?.[0].value.toLowerCase();
            switch (content_type) {
            case "application/json": {
                body_ = JSON.stringify(payload);
                break;
            }
            case "application/x-www-form-urlencoded": {
                body_ = new URLSearchParams(payload).toString();
                break;
            }
            case "multipart/form-data": {
                body_ = new FormData();
                for (const key in payload) {
                    if (!Object.prototype.hasOwnProperty.call(payload, key)) { continue; }
                    const value = payload[key];
                    body_.append(key, value);
                }
                break;
            }
            default:
                body_ = JSON.stringify(payload);
                break;
            }
        }

        const request = {
            url    : url_,
            method : method,
            headers: headers_,
            body   : body_
        };

        for (const k in fetch_options_) {
            if (!Object.prototype.hasOwnProperty.call(fetch_options_, k)) { continue; }
            if (ReservedRequestPropertyNames.has(k)) {
                Alier.Sys.logw(0, `You shan't overwrite the property "${k}" via a fetch options argument. It was ignored.`);
                continue;
            }

            request[k] = fetch_options_[k];
        }

        return request;
    }

    /**
     * Appends parameters used for authorization to the given request object.
     *
     * @param {(
     *  {
     *      method : "GET"     |
     *               "POST"    |
     *               "PUT"     |
     *               "DELETE"  |
     *               "HEAD"    |
     *               "OPTIONS" |
     *               "PATCH"   ,
     *      url    : string    ,
     *      headers: {
     *          [header_name: string]: string
     *      },
     *      body   : string    |
     *               FormData  |
     *               null
     *  }
     * )} request
     * A request object.
     *
     * @param {IAuthAgent} authAgent
     * An entity for authorization/authentication passed at instantiation.
     *
     * @returns
     * A request object with parameters used for authorization process.
     */
    async makeAuthorizedRequest(request, authAgent) {
        const auth_headers = await authAgent?.getHeaders(request) ?? ({});
        if (request.headers == null) {
            request.headers = ({});
        }
        Object.assign(request.headers, auth_headers);
        return request;
    }

    /**
     * @async
     *
     * Decides whether or not to make a retry.
     *
     * @param {IAuthAgent} authAgent
     * An entity for authorization/authentication passed at instantiation.
     *
     * @returns {Promise<boolean>}
     * `true` if it is allowed to retry, `false` otherwise.
     */
    async shouldRetryOnUnauthorized(authAgent) {
        const can_retry = await (authAgent?.refresh() ?? false);
        return (typeof can_retry !== "boolean") || can_retry;
    }

    /**
     * @async
     *
     * Makes response data from the given request and response.
     *
     * @param {(
     *  {
     *      method : "GET"     |
     *               "POST"    |
     *               "PUT"     |
     *               "DELETE"  |
     *               "HEAD"    |
     *               "OPTIONS" |
     *               "PATCH"   ,
     *      url    : string    ,
     *      headers: {
     *          [header_name: string]: string
     *      },
     *      body   : string    |
     *               FormData  |
     *               null
     *  }
     * )} request
     * A request object.
     *
     * @param {Response} response
     * A raw response object.
     *
     * @returns response data.
     * The shape of data is basically depending on the request method and response status.
     */
    async makeResponse(request, response) {
        const requested_method = (request.headers == null || request.method !== "POST") ? request.method : (
            request.headers["x-http-method-override"] ??
            request.headers["x-method-override"] ??
            request.headers["x-http-method"] ??
            request.method
        ).trim().toUpperCase();

        if (requested_method === "HEAD" || requested_method === "OPTIONS") {
            return response.headers;
        } else if (response.status >= 400) {
            const content_types = [...parseHeaderValue("content-type", response.headers.get("content-type") ?? "application/octet-stream")];
            const content_type  = content_types[0].value.toLowerCase();
            if (content_type === "application/json") {
                const { error } = await response.json();
                throw new WebApiError(response.status, error.message, { cause: error });
            } else if (content_type.startsWith("text/")) {
                const error_text = await response.text();
                throw new WebApiError(response.status, response.statusText, { cause: error_text });
            } else {
                throw new WebApiError(response.status, response.statusText, { cause: await response.arrayBuffer() });
            }
        } else if (response.status === 304) {
            return { notModified: true, status: response.status };
        } else if (response.status === 204) {
            return { noContent: true, status: response.status };
        } else if (response.status === 201) {
            return { created: true, status: response.status };
        } else if (response.body != null) {
            const content_types = [...parseHeaderValue("content-type", response.headers.get("content-type") ?? "application/octet-stream")];
            const content_type  = content_types[0].value.toLowerCase();
            if (content_type === "application/json") {
                return response.json();
            }  else if (content_type.startsWith("text/")) {
                return response.text();
            } else {
                return response.arrayBuffer();
            }
        } else {
            return { status: response.status };
        }
    }

    /**
     *
     * @param { "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "PATCH" } method
     * @param {({[param_name: string]: any })?} params
     * @param {({[header_name: string]: string }?)} headers
     * @param {({[option_name: string]: any }?)} fetchOptions
     * @returns
     *
     * @throws {TypeError}
     * -  when the given method is not a string
     * -  when unknown method name is given
     * -  when the given params is neither null nor an object
     * -  when the given headers is neither null nor an object
     * -  when the given fetch options is neither null nor an object
     * -  when the return value of `makeRequest()` method is invalid
     *    -  the return value was not a non-null object
     *    -  method name was modified
     *    -  headers was not an object
     *    -  url was neither a string nor an URL
     */
    async do(method, params, headers, fetchOptions) {
        if (typeof method !== "string") {
            throw new TypeError(`${method} is not a string`);
        }

        /** @type {"GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "PATCH" } */
        const method_ = method.trim().toUpperCase();

        if (!MethodList.has(method_)) {
            throw new TypeError(`Unknown method ${JSON.stringify(method_)} is specified`);
        } else if (!(params == null || typeof params === "object")) {
            throw new TypeError(`${params} is neither null nor an object`);
        } else if (!(headers == null || typeof headers === "object")) {
            throw new TypeError(`${headers} is neither null nor an object`);
        } else if (!(fetchOptions == null || typeof fetchOptions === "object")) {
            throw new TypeError(`${fetchOptions} is neither null nor an object`);
        }

        const params_  = params == null ? ({}) : Object.assign({}, params);
        const headers_ = (headers instanceof Headers) ?
                Object.fromEntries(headers.entries()) :
                headers
        ;
        const fetch_options_  = fetchOptions == null ? ({}) : Object.assign({}, fetchOptions);

        const base_request = this.makeRequest(method_, params_, headers_, fetch_options_);
        const request = this.#auth_agent == null ?
            base_request :
            await this.makeAuthorizedRequest(base_request, this.#auth_agent)
        ;

        //  Both makeRequest() and makeAuthorizedRequest() are intended to be overridden for tweaking behavior by,
        //  e.g., adding some optional parameters.
        //  To achieve that safely, checking type of its return values.
        if (request === null || typeof request !== "object") {
            throw new TypeError(`${request} is not a non-null object`);
        } else if (!(typeof request.url === "string" || (request.url instanceof URL))) {
            throw new TypeError(`${request.url} is neither a string nor an URL`);
        } else if (typeof request.method !== "string") {
            throw new TypeError(`${request.method} is not a string`);
        } else if (request.method !== method_) {
            throw new TypeError(`method name is modified from ${method_} to ${request.method}`);
        } else if (!(request.headers == null || typeof request.headers === "object")) {
            throw new TypeError(`${request.headers} is neither null nor an object`);
        }

        if (request.headers instanceof Headers) {
            request.headers = Object.fromEntries(request.headers.entries());
        } else if (request.headers == null) {
            request.headers = ({});
        }

        for (const k in fetch_options_) {
            if (!Object.prototype.hasOwnProperty.call(fetch_options_, k)) { continue; }
            if (ReservedRequestPropertyNames.has(k)) {
                Alier.Sys.logw(0, `You shan't overwrite the property "${k}" via a fetch options argument. It was ignored.`);
                continue;
            }

            request[k] = fetch_options_[k];
        }

        if (headers_ != null) {
            Object.assign(request.headers, headers_);
        }

        const { url, ... request_options } = request;

        const response = await Alier.fetch(url, request_options);

        if (this.#auth_agent != null &&
            response.status === 401  &&
            await this.shouldRetryOnUnauthorized(this.#auth_agent)
        ) {
            const retry_request = await this.makeAuthorizedRequest(request, this.#auth_agent);
            const { url: _, ... retry_request_options } = retry_request;

            const retry_response = await Alier.fetch(url, retry_request_options);

            return this.makeResponse(retry_request, retry_response);
        }

        return this.makeResponse(request, response);
    }

    /** @type {Pattern} */
    #path;
    /** @type {string} */
    #host;
    /** @type {IAuthAgent?} */
    #auth_agent;
}

export { WebApi, WebApiError, parseHeader, parseHeaderValue };
