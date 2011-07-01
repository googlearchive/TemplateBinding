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
  var observerIds = 1;
  var observerMutations = new WeakMap();
  var activeObservers = [];

  // "Private"
  this.enqueueMutation_ = function(observer, mutation) {
    // The "mock" implementation of WeakMap has O(N) lookup unless
    // a 'magic' |__id__| unique id property is present.
    if (!observer.__id__)
      observer.__id__ = observerIds++;

    var mutations = observerMutations.get(observer);
    if (!mutations) {
      mutations = [];
      observerMutations.set(observer, mutations);
      activeObservers.push(observer);
    }
    mutations.push(mutation);
  };

  // "Private"
  this.notifyObservers_ = function() {
    while (activeObservers.length) {
      var observer = activeObservers.shift();
      var mutations = observerMutations.get(observer);
      observerMutations['delete'](observer);
      observer(mutations);
    }
  };
})()
