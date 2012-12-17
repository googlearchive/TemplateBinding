// Copyright 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var AttributeKind = {
  UNKNOWN: 0,
  BOOLEAN: 1,
  EVENT_HANDLER: 2
};

var getAttributeKind = (function() {

  // This is generated using data from:
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/section-index.html
  var booleanAttributes = {
    allowfullscreen: ['iframe'],
    async: ['script'],
    autofocus: ['button', 'input', 'keygen', 'select', 'textarea'],
    autoplay: ['audio', 'video'],
    checked: ['command', 'input'],
    controls: ['audio', 'video'],
    'default': ['track'],
    defer: ['script'],
    disabled: [
      'button',
      'command',
      'fieldset',
      'input',
      'keygen',
      'optgroup',
      'option',
      'select',
      'textarea'
    ],
    formnovalidate: ['button', 'input'],
    hidden: true,
    inert: true,
    ismap: ['img'],
    itemscope: true,
    loop: ['audio', 'video'],
    multiple: ['input', 'select'],
    muted: ['audio', 'video'],
    novalidate: ['form'],
    open: ['dialog'],
    readonly: ['input', 'textarea'],
    required: ['input', 'select', 'textarea'],
    reversed: ['ol'],
    scoped: ['style'],
    seamless: ['iframe'],
    selected: ['option'],
    typemustmatch: ['object']
  };

  // This is generated using data from:
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/section-index.html
  var eventHandlerMap = { onabort: true,
    onafterprint: ['body'],
    onbeforeprint: ['body'],
    onbeforeunload: ['body'],
    onblur: true,
    oncancel: true,
    oncanplay: true,
    oncanplaythrough: true,
    onchange: true,
    onclick: true,
    onclose: true,
    oncontextmenu: true,
    oncuechange: true,
    ondblclick: true,
    ondrag: true,
    ondragend: true,
    ondragenter: true,
    ondragleave: true,
    ondragover: true,
    ondragstart: true,
    ondrop: true,
    ondurationchange: true,
    onemptied: true,
    onended: true,
    onerror: true,
    onfocus: true,
    onfullscreenchange: ['body'],
    onfullscreenerror: ['body'],
    onhashchange: ['body'],
    oninput: true,
    oninvalid: true,
    onkeydown: true,
    onkeypress: true,
    onkeyup: true,
    onload: true,
    onloadeddata: true,
    onloadedmetadata: true,
    onloadstart: true,
    onmessage: ['body'],
    onmousedown: true,
    onmousemove: true,
    onmouseout: true,
    onmouseover: true,
    onmouseup: true,
    onmousewheel: true,
    onoffline: ['body'],
    ononline: ['body'],
    onpagehide: ['body'],
    onpageshow: ['body'],
    onpause: true,
    onplay: true,
    onplaying: true,
    onpopstate: ['body'],
    onprogress: true,
    onratechange: true,
    onreset: true,
    onresize: ['body'],
    onscroll: true,
    onseeked: true,
    onseeking: true,
    onselect: true,
    onshow: true,
    onstalled: true,
    onstorage: ['body'],
    onsubmit: true,
    onsuspend: true,
    ontimeupdate: true,
    onunload: ['body'],
    onvolumechange: true,
    onwaiting: true
  };

  function contains(arr, val) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === val)
        return true;
    }
    return false;
  }

  function inTable(table, lcTagName, lcName) {
    var v = table[lcName];
    if (!v)
      return false;
    return v === true || contains(v, lcTagName);
  }

  function getAttributeKind(tagName, name) {
    var lcName = name.toLowerCase();
    var lcTagName = tagName.toLowerCase();

    if (isEventHandler(lcTagName, lcName))
      return AttributeKind.EVENT_HANDLER;

    if (isBooleanAttribute(lcTagName, lcName))
      return AttributeKind.BOOLEAN;

    return AttributeKind.UNKNOWN;
  }

  function isEventHandler(lcTagName, lcName) {
    return inTable(eventHandlerMap, lcTagName, lcName);
  }

  function isBooleanAttribute(lcTagName, lcName) {
    return inTable(booleanAttributes, lcTagName, lcName);
  }

  return getAttributeKind;
})();
