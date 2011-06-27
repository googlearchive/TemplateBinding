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

/**
 * Observe additions and removals of elements matching the given selector
 * in the Document or DocumentFragment on which this method is called.
 *
 * When an element |el| matching |selector| is inserted, a mutation will
 * be appended to the log: {element: el, type: 'ElementAdded'}
 *
 * When an element |el| matching |selector|  is removed, a mutation will
 * be appended to the log: {element: el, type: 'ElementAdded'}
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {MutationLog} log the log into which mutations will be written.
 */
Document.prototype.observeElement = function(selector, log) {
  if (!isValidSelector(selector))
    throw Error('Invalid selector (not simple enough): ' + selector);
  selector = selector.toUpperCase();

  this.elementObservers_ = this.elementObservers_ || [];
  for (var i = 0; i < this.elementObservers_.length; i++) {
    var ob = this.elementObservers_[i];
    if (ob.log === log) {
      // Already observing, add our selector to the list if
      // it's not already there.
      if (ob.selectors.indexOf(selector) < 0)
        ob.selectors.push(selector);
      return;
    }
  }

  var underlyingLog = new MutationLog;
  observeSubtreeForChildlistChanged(this, underlyingLog);

  var selectors = [selector];
  var callback = elementCallback.bind(undefined, selectors, log, underlyingLog);
  AspectWorkQueue.register(underlyingLog, callback);
  this.elementObservers_.push({
    selectors: selectors,
    log: log,
    underlyingLog: underlyingLog,
  });
};

/**
 * Stop observation on the given |selector| and |log|.
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {MutationLog} log the log into which mutations will be written.
 */
Document.prototype.stopObservingElement = function(selector, log) {
  selector = selector.toUpperCase();
  for (var i = 0; i < this.elementObservers_.length; i++) {
    var ob = this.elementObservers_[i];
    if (ob.log === log) {
      var index = ob.selectors.indexOf(selector);
      if (index >= 0)
        ob.selectors.splice(index, 1);
      if (!ob.selectors.length) {
        AspectWorkQueue.release(ob.underlyingLog);
        this.removeSubtreeChangedListener(ob.underlyingLog);
        this.elementObservers_.splice(i, 1);
      }
      break;
    }
  }
};

/**
 * Observe additions, removals, and updates of the given |attribute|
 * on elements matching |selector|.
 *
 * When a mutation occurs, a mutation will be appended to the log:
 * {element: el, attribute: attribute type: 'AttributeChanged'}
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {string} attribute the name of the attribute to be observed
 * @param {MutationLog} log the log into which mutations will be written.
 */
Document.prototype.observeAttribute = function(selector, attribute, log) {
  if (!isValidSelector(selector))
    throw Error('Invalid selector (not simple enough): ' + selector);
  selector = selector.toUpperCase();

  this.attributeObservers_ = this.attributeObservers_ || [];
  for (var i = 0; i < this.attributeObservers_.length; i++) {
    var ob = this.attributeObservers_[i];
    if (ob.log === log) {
      for (var j = 0; j < ob.selectors.length; j++) {
        if (ob.selectors[j].selector == selector) {
          if (ob.selectors[j].attributes.indexOf(attribute) < 0)
            ob.selectors[j].attribtues.push(attribute);
          return;
        }
      }
      ob.selectors.push({
        selector: selector,
        attributes: [attribute]
      });
      return;
    }
  }

  var underlyingLog = new MutationLog;
  this.addSubtreeChangedListener(underlyingLog);
  this.addSubtreeAttributeChangedListener(underlyingLog);
  var selectors = [{selector: selector, attributes: [attribute]}];
  var callback = attributeCallback.bind(
      undefined, selectors, log, underlyingLog);
  AspectWorkQueue.register(underlyingLog, callback);
  this.attributeObservers_.push({
    selectors: selectors,
    log: log,
    underlyingLog: underlyingLog,
  });
};

/**
 * Stop observation of the given |selector|, |attribute| and |log|.
 *
 * @param {string} selector a CSS element selector, either a tag name or '*'
 * @param {string} attribute the name of the attribute to be observed
 * @param {MutationLog} log the log into which mutations will be written.
 */
Document.prototype.stopObservingAttribute = function(selector, attribute, log) {
  selector = selector.toUpperCase();
  for (var i = 0; i < this.attributeObservers_.length; i++) {
    var ob = this.attributeObservers_[i];
    if (ob.log === log) {
      for (var j = 0; j < ob.selectors.length; j++) {
        var s = ob.selectors[j];
        if (s.selector == selector) {
          var index = s.attributes.indexOf(attribute);
          if (index >= 0)
            s.attributes.splice(index, 1);
          if (!s.attributes.length) {
            ob.selectors.splice(j, 1);
            if (!ob.selectors.length) {
              AspectWorkQueue.release(ob.underlyingLog);
              this.removeSubtreeChangedListener(ob.underlyingLog);
              this.removeSubtreeAttributeChangedListener(ob.underlyingLog);
              this.attributeObservers_.splice(i, 1);
            }
          }
          break;
        }
      }
      return;
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

function observeSubtreeForChildlistChanged(node, log, depth) {
  node.addChildlistChangedListener(log);
  node = node.firstChild;
  while (node) {
    observeSubtreeForChildlistChanged(node, log);
    node = node.nextSibling;
  }
}

function stopObservingSubtreeForChildlistChanged(node, log) {
  node.removeChildlistChangedListener(log);
  node = node.firstChild;
  while (node) {
    stopObservingSubtreeForChildlistChanged(node, log);
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
//   1. For each ChildlistChanged mutation from underlyingLog:
//     i. For each element added, walk its tree:
//       a. Increment the counter for all matched elements in the subtree.
//       b. Add ChildlistChanged listeners to every element in the subtree.
//     ii. For each element removed, walk its tree:
//       a. Decrement the counter for all matched elements in the subtree.
//       b. Remove ChildlistChanged listeners to every element in the subtree.
//   3. For each element with a count > 0, add an ElementAdded mutation to
//      the log.
//   4. For each element with a count < 0, add an ElementRemoved mutation to
//      the log.
function elementCallback(selectors, log, underlyingLog, mutations) {
  var elementCounter = new ElementCounter;
  mutations.forEach(function(mutation) {
    mutation.added.forEach(function(el) {
      selectors.forEach(function(selector) {
        forAllMatches(el, selector, elementCounter.boundIncrement);
      });
      observeSubtreeForChildlistChanged(el, underlyingLog);
    });
    mutation.removed.forEach(function(el) {
      selectors.forEach(function(selector) {
        forAllMatches(el, selector, elementCounter.boundDecrement);
      });
      stopObservingSubtreeForChildlistChanged(el, underlyingLog);
    });
  });
  elementCounter.getAdded().forEach(function(el) {
    log.append({
      type: 'ElementAdded',
      element: el,
    });
  });
  elementCounter.getRemoved().forEach(function(el) {
    log.append({
      type: 'ElementRemoved',
      element: el,
    });
  });
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
//      in |underlyingLog|.
function attributeCallback(selectors, log, underlyingLog, mutations) {
  var targets = [];
  mutations.forEach(function(mutation) {
    if (mutation.type != 'AttributeChanged')
      return;
    var element = mutation.target;
    var attribute = mutation.attrName;
    function elementAndAttributeMatch(s) {
      return matchesSelector(element, s.selector) &&
          s.attributes.indexOf(attribute) >= 0;
    }
    if (selectors.some(elementAndAttributeMatch)) {
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
      selectors.forEach(function(s) {
        forAllMatches(el, s.selector, elementCounter.boundIncrement);
      });
    });

    mutation.removed.forEach(function(el) {
      selectors.forEach(function(s) {
        forAllMatches(el, s.selector, elementCounter.boundDecrement);
      });
    });
  });
  var added = elementCounter.getAdded();
  var removed = elementCounter.getRemoved();
  var transient = elementCounter.getTransient();
  targets.forEach(function(t) {
    if (added.indexOf(t.element) < 0 &&
        removed.indexOf(t.element) < 0 &&
        transient.indexOf(t.element) < 0) {
      log.append({
        type: 'AttributeChanged',
        element: t.element,
        attribute: t.attribute,
      });
    }
  });
}

})()
