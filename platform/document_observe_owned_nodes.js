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

(function() {

var forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);

// Observe all nodes in document.
document.addEventListener('DOMContentLoaded', function(e) {
  observeSubtree(document);
}, false);

// Observe created nodes. NOTE: Gecko seems to ignore monkeypatching
// Document.prototype, so we just replace the property on document.
// TODO(rafaelw): A full implementation will need to capture the remaining
// document.createXXX.
var capturedCreateElement = document.createElement;
document.createElement = function() {
  var node = capturedCreateElement.apply(this, arguments);
  observeNode(node);
  return node;
}

function observeSubtree(node) {
  observeNode(node);
  forEach(document.querySelectorAll('*'), observeNode);
}

function observeNode(node) {
  node.addEventListener('DOMNodeInserted', domNodeInserted, false);
  node.addEventListener('DOMNodeRemoved', domNodeRemoved, false);
}

function enqueueMutation(document, mutation) {
  if (!document.observers_)
    return;

  document.observers_.forEach(function(observer) {
    window.enqueueMutation_(observer.callback, mutation);
  });
}

var indexOf = Array.prototype.indexOf.call.bind(Array.prototype.indexOf);

function domNodeInserted(event) {
  enqueueMutation(event.target.ownerDocument, {
    target: event.target.parentNode,
    type: 'ChildlistChanged',
    index: indexOf(event.target.parentNode.childNodes, event.target),
    added: [event.target],
    removed: []
  });

  event.stopPropagation();
}

function domNodeRemoved(event) {
  enqueueMutation(event.target.ownerDocument, {
    target: event.target.parentNode,
    type: 'ChildlistChanged',
    index: indexOf(event.target.parentNode.childNodes, event.target),
    added: [],
    removed: [event.target]
  });

  event.stopPropagation();
}

// Public API
Document.prototype.observeOwnedNodes = function(callback) {
  if (!this.observers_) {
    this.observers_ = [];
  }

  for (var i = 0; i < this.observers_.length; i++) {
    var observer = this.observers_[i];
    if (observer.callback === callback)
      return;
  }

  this.observers_.push({
    callback: callback
  })
};

Document.prototype.stopObservingOwnedNodes = function(callback) {
  if (!this.observers_ || !this.observers_.length)
    return;

  var i = 0;
  for (; i < this.observers_.length; i++) {
    var observer = this.observers_[i];
    if (observer.callback === callback)
      break;
  }

  if (i < this.observers_.length)
    this.observers_.splice(i, 1);
};

})()
