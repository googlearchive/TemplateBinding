// Copyright 2013 Google Inc.
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

// Flags: --allow-natives-syntax

var testDiv = document.createElement('div');
var width = 2;
var depth = 4;
var decoration = 8;
var instanceCount = 10;
var oneTime = false;
var compoundBindings = false;
var expressionCheckbox = false;
var bindingDensities = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1];
var testTypes = ['MDV'];

function benchmarkComplete(results) {
  print('benchmarkComplete');
  print(JSON.stringify(results));
}

function updateStatus(density, testType, runCount) {
  print('updateStatus');
  print(testType + ' ' + (100 * density) +
        '% binding density, ' + runCount + ' runs');
}

var test = new MDVBenchmark(testDiv, width, depth, decoration, instanceCount,
                            oneTime,
                            compoundBindings,
                            expressionCheckbox);

var runner = new BenchmarkRunner(test,
                                 bindingDensities,
                                 testTypes,
                                 benchmarkComplete,
                                 updateStatus);
runner.go();
runTimeouts();
