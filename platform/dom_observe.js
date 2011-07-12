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

var INSERTED = 0x1;
var REMOVED = 0x2;

/**
 * Observe insertions of elements matching the given selector
 * in the Document or DocumentFragment on which this method is called.
 *
 * When an element |el| matching |selector| is inserted, |callback|
 * will be called and passed an object with two keys:
 * 'element' (which will be |el|) and 'type' which will be 'ElementInserted'.
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {function} callback the callback to invoke on insertion
 */
Document.prototype.observeElementInserted = function(selector, callback) {
  observeElement(this, selector, callback, INSERTED);
};

/**
 * Observe removals of elements matching the given selector
 * in the Document or DocumentFragment on which this method is called.
 *
 * When an element |el| matching |selector| is removed, |callback|
 * will be called and passed an object with two keys:
 * 'element' (which will be |el|) and 'type' which will be 'ElementRemoved'.
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {function} callback the callback to invoke on removal
 */
Document.prototype.observeElementRemoved = function(selector, callback) {
  observeElement(this, selector, callback, REMOVED);
};

/**
 * Stop observation of element insertion for the given |selector|
 * and |callback|.
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {function} callback the callback to invoke on insertion
 */
Document.prototype.stopObservingElementInserted = function(selector, callback) {
  stopObservingElement(this, selector, callback, INSERTED);
};

/**
 * Stop observation of element removal for the given |selector|
 * and |callback|.
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {function} callback the callback to invoke on removal
 */
Document.prototype.stopObservingElementRemoved = function(selector, callback) {
  stopObservingElement(this, selector, callback, REMOVED);
};

function observeElement(node, selector, callback, type) {
  selector = selector.toUpperCase();
  if (!isValidSelector(selector))
    throw Error('Invalid selector (not simple enough): ' + selector);

  var observers = node.elementObservers_ = node.elementObservers_ || [];
  for (var i = 0; i < observers.length; i++) {
    var ob = observers[i];
    if (ob.callback === callback) {
      ob.selectors[selector] |= type;
      return;
    }
  }

  var observerInfo = {
    callback: callback,
    selectors: {}
  };
  var observer = elementCallback.bind(undefined, observerInfo);
  observeSubtreeForChildlistChanged(node, observer);
  observerInfo.observer = observer;
  observerInfo.selectors[selector] = type;
  observers.push(observerInfo);
}

function stopObservingElement(node, selector, callback, type) {
  var observers = node.elementObservers_;
  if (!observers)
    return;
  selector = selector.toUpperCase();
  for (var i = 0; i < observers.length; i++) {
    var ob = observers[i];
    if (ob.callback === callback) {
      if (ob.selectors[selector]) {
        ob.selectors[selector] &= ~type;
        if (!ob.selectors[selector])
          delete ob.selectors[selector];
        if (!Object.keys(ob.selectors).length) {
          node.removeSubtreeChangedListener(ob.observer);
          observers.splice(i, 1);
        }
      }
      break;
    }
  }
}

/**
 * Observe additions, removals, and updates of the given |attribute|
 * on elements matching |selector|.
 *
 * When a mutation occurs, |callback| will be called with an object:
 * {element: el, attribute: attribute}
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {string} attribute the name of the attribute to be observed
 * @param {function} callback the callback which is called with changes
 */
Document.prototype.observeAttribute = function(selector, attribute, callback) {
  selector = selector.toUpperCase();
  attribute = attribute.toLowerCase();
  if (!isValidSelector(selector))
    throw Error('Invalid selector (not simple enough): ' + selector);

  this.attributeObservers_ = this.attributeObservers_ || [];
  for (var i = 0; i < this.attributeObservers_.length; i++) {
    var ob = this.attributeObservers_[i];
    if (ob.callback === callback) {
      if (!ob.selectors[selector])
        ob.selectors[selector] = {};
      ob.selectors[selector][attribute] = true;
      return;
    }
  }

  var selectors = {};
  selectors[selector] = {};
  selectors[selector][attribute] = true;
  var observerInfo = {
    selectors: selectors,
    callback: callback,
  };
  var observer = attributeCallback.bind(undefined, observerInfo);
  observerInfo.observer = observer;
  this.addSubtreeChangedListener(observer);
  this.addSubtreeAttributeChangedListener(observer);
  this.attributeObservers_.push(observerInfo);
};

/**
 * Stop observation of the given |selector|, |attribute| and |callback|.
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {string} attribute the name of the attribute to be observed
 * @param {function} callback the callback to be called with changes
 */
Document.prototype.stopObservingAttribute =
    function(selector, attribute, callback) {
  selector = selector.toUpperCase();
  attribute = attribute.toLowerCase();
  for (var i = 0; i < this.attributeObservers_.length; i++) {
    var ob = this.attributeObservers_[i];
    if (ob.callback === callback) {
      if (ob.selectors[selector] && ob.selectors[selector][attribute]) {
        delete ob.selectors[selector][attribute];
        if (!Object.keys(ob.selectors[selector]).length)
          delete ob.selectors[selector];
        if (!Object.keys(ob.selectors).length) {
          this.removeSubtreeChangedListener(ob.observer);
          this.removeSubtreeAttributeChangedListener(ob.observer);
          this.attributeObservers_.splice(i, 1);
        }
      }
      break;
    }
  }
};

DocumentFragment.prototype.observeElement =
    Document.prototype.observeElement;
DocumentFragment.prototype.stopObservingElement =
    Document.prototype.stopObservingElement;
DocumentFragment.prototype.observeAttribute =
    Document.prototype.observeAttribute;
DocumentFragment.prototype.stopObservingAttribute =
    Document.prototype.stopObservingAttribute;

function observeSubtreeForChildlistChanged(node, observer, depth) {
  node.addChildlistChangedListener(observer);
  node = node.firstChild;
  while (node) {
    observeSubtreeForChildlistChanged(node, observer);
    node = node.nextSibling;
  }
}

function stopObservingSubtreeForChildlistChanged(node, observer) {
  node.removeChildlistChangedListener(observer);
  node = node.firstChild;
  while (node) {
    stopObservingSubtreeForChildlistChanged(node, observer);
    node = node.nextSibling;
  }
}

function matchesSelector(el, selector) {
  return selector == '*' || el.tagName == selector;
}

function isValidSelector(selector) {
  return !!selector.match(/^(?:\*|[A-Za-z]+)$/);
}

function forAllMatches(el, selector, func) {
  if (matchesSelector(el, selector))
    func(el);
  Array.prototype.forEach.call(el.querySelectorAll(selector), func);
}

function ElementCounter() {
  this.entries_ = [];
  this.boundIncrement = this.increment_.bind(this);
  this.boundDecrement = this.decrement_.bind(this);
}

function mapEntryToElement(entry) {
  return entry.element;
}

ElementCounter.prototype = {
  get_: function(el, op) {
    for (var i = 0; i < this.entries_.length; i++) {
      if (this.entries_[i].element === el)
        return this.entries_[i];
    }
    var entry = {element: el, count: 0, firstOp: op};
    this.entries_.push(entry);
    return entry;
  },
  increment_: function(el) {
    this.get_(el, 'increment').count++;
  },
  decrement_: function(el) {
    this.get_(el, 'decrement').count--;
  },
  getAdded: function() {
    return this.entries_.filter(function(entry) {
      return entry.count > 0;
    }).map(mapEntryToElement);
  },
  getRemoved: function() {
    return this.entries_.filter(function(entry) {
      return entry.count < 0;
    }).map(mapEntryToElement);
  },
  // Transient elements are those that were added, then
  // later removed from the tree. For AttributeChanged, we want
  // to keep track of these so that we can avoid logging mutations
  // to these elements.
  getTransient: function() {
    return this.entries_.filter(function(entry) {
      return entry.firstOp == 'increment' && entry.count == 0;
    }).map(mapEntryToElement);
  },
}

// Algorithm:
//
//   1. For each ChildlistChanged mutation from in |mutations|:
//     i. For each element added, walk its tree:
//       a. Increment the counter for all matched elements in the subtree.
//       b. Add ChildlistChanged listeners to every element in the subtree.
//     ii. For each element removed, walk its tree:
//       a. Decrement the counter for all matched elements in the subtree.
//       b. Remove ChildlistChanged listeners to every element in the subtree.
//   3. For each element with a count > 0, call the callback with an
//      ElementInserted mutation.
//   4. For each element with a count < 0, call the callback with an
//      ElementRemoved mutation.
function elementCallback(observerInfo, mutations) {
  var selectors = observerInfo.selectors;
  var elementCounter = new ElementCounter;
  mutations.forEach(function(mutation) {
    mutation.added.forEach(function(el) {
      for (var selector in selectors) {
        forAllMatches(el, selector, elementCounter.boundIncrement);
      }
      observeSubtreeForChildlistChanged(el, observerInfo.observer);
    });
    mutation.removed.forEach(function(el) {
      for (var selector in selectors) {
        forAllMatches(el, selector, elementCounter.boundDecrement);
      }
      stopObservingSubtreeForChildlistChanged(el, observerInfo.observer);
    });
  });

  function notify(type, el) {
    if ((selectors['*'] & type) || (selectors[el.tagName] & type)) {
      try {
        observerInfo.callback({
            element: el,
            type: type == INSERTED ? 'ElementInserted' : 'ElementRemoved',
        });
      } catch (e) {
        console.error('Error: callback threw exception ' + e);
      }
    }
  }
  elementCounter.getAdded().forEach(notify.bind(undefined, INSERTED));
  elementCounter.getRemoved().forEach(notify.bind(undefined, REMOVED));
}

// Algorithm:
//
//   1. For each AttributeChanged mutation, if the mutated element
//      matches |selector|, add it to the |targets| list.
//   2. Run over the list of ChildlistChange mutations and use the same
//      algorithm used by elementCallback to figure out which elements
//      were added or removed.
//   3. For each target, add a mutation to |log| iff the target was
//      not listed as added, removed, or "transient" (added and later removed)
//      in |log|.
function attributeCallback(observerInfo, mutations) {
  var selectors = observerInfo.selectors;
  var targets = [];
  mutations.forEach(function(mutation) {
    if (mutation.type != 'AttributeChanged')
      return;
    var element = mutation.target;
    var tagName = element.tagName;
    var attribute = mutation.attrName;
    if ((selectors['*'] && selectors['*'][attribute]) ||
        (selectors[tagName] && selectors[tagName][attribute])) {
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].element === element &&
            targets[i].attribute == attribute) {
          // Already listed this target pair.
          return;
        }
      }
      targets.push({element: element, attribute: attribute});
    }
  });
  var elementCounter = new ElementCounter;
  mutations.forEach(function(mutation) {
    if (mutation.type != 'ChildlistChanged')
      return;
    mutation.added.forEach(function(el) {
      for (var selector in selectors) {
        forAllMatches(el, selector, elementCounter.boundIncrement);
      }
    });

    mutation.removed.forEach(function(el) {
      for (var selector in selectors) {
        forAllMatches(el, selector, elementCounter.boundDecrement);
      }
    });
  });
  var added = elementCounter.getAdded();
  var removed = elementCounter.getRemoved();
  var transient = elementCounter.getTransient();
  targets.forEach(function(t) {
    if (added.indexOf(t.element) < 0 &&
        removed.indexOf(t.element) < 0 &&
        transient.indexOf(t.element) < 0) {
      try {
        observerInfo.callback({
            element: t.element,
            attribute: t.attribute,
        });
      } catch (e) {
        console.log('Error: callback threw exception ' + e);
      }
    }
  });
}

})()
