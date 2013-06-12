 /**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/
var hooker = require('../src/hooker'),
    util   = require('../src/util'),
    shell  = require('shelljs'),
    path   = require('path'),
    fs     = require('fs'),
    os     = require('os'),
    tempDir= path.join(__dirname, '..', 'temp'),
    hooks  = path.join(__dirname, 'fixtures', 'hooks'),
    cordova= require('../cordova');

var platform = os.platform();
var cwd = process.cwd();

describe('hooker', function() {
    it('should throw if provided directory is not a cordova project', function() {
        spyOn(util, 'isCordova').andReturn(false);
        expect(function() {
            new hooker(tempDir);
        }).toThrow('Not a Cordova project, can\'t use hooks.');
    });
    it('should not throw if provided directory is a cordova project', function() {
        var root = '/some/root';
        spyOn(util, 'isCordova').andReturn(root);
        expect(function() {
            var h = new hooker(tempDir);
            expect(h.root).toEqual(root);
        }).not.toThrow();
    });

    describe('global (static) fire method', function() {
        it('should execute listeners serially', function(done) {
            var timeout = 20;
            var test_event = 'poop';
            var h1_fired = false;
            var h1 = function(root, cb) {
                h1_fired = true;
                setTimeout(cb, timeout);
            };
            var h2_fired = false;
            var h2 = function() {
                h2_fired = true;
            };
            runs(function() {
                cordova.on(test_event, h1);
                cordova.on(test_event, h2);
                hooker.fire(test_event, function(err) {
                    done();
                });
                expect(h1_fired).toBe(true);
                expect(h2_fired).toBe(false);
            });
            waits(timeout);
            runs(function() {
                expect(h2_fired).toBe(true);
            });
        });
    });
    describe('project-level fire method', function() {
        var h;
        beforeEach(function() {
            spyOn(util, 'isCordova').andReturn(tempDir);
            h = new hooker(tempDir);
        });

        describe('failure', function() {
            it('should not error if the hook is unrecognized', function(done) {
                h.fire('CLEAN YOUR SHORTS GODDAMNIT LIKE A BIG BOY!', function(err){
                    expect(err).not.toBeDefined();
                    done();
                });
            });
            it('should error if any script exits with non-zero code', function(done) {
                var script = path.join(tempDir, '.cordova', 'hooks', 'before_build');
                shell.mkdir('-p', script);
                this.after(function() { shell.rm('-rf', tempDir); });
                if (platform.match(/(win32|win64)/)) {
                    script = path.join(script, 'fail.bat');
                    shell.cp(path.join(hooks, 'fail', 'fail.bat'), script);
                } else {
                    script = path.join(script, 'fail.sh');
                    shell.cp(path.join(hooks, 'fail', 'fail.sh'), script);
                }
                fs.chmodSync(script, '754');
                h.fire('before_build', function(err){
                    expect(err).toBeDefined();
                    done();
                });
            });
        });

        describe('success', function() {
            it('should execute all scripts in order and fire callback', function(done) {
                var hook = path.join(tempDir, '.cordova', 'hooks', 'before_build');
                shell.mkdir('-p', hook);
                this.after(function() { shell.rm('-rf', tempDir); });
                if (platform.match(/(win32|win64)/)) {
                    shell.cp(path.join(hooks, 'test', '0.bat'), hook);
                    shell.cp(path.join(hooks, 'test', '1.bat'), hook);
                } else {
                    shell.cp(path.join(hooks, 'test', '0.sh'), hook);
                    shell.cp(path.join(hooks, 'test', '1.sh'), hook);
                }
                fs.readdirSync(hook).forEach(function(script) {
                    fs.chmodSync(path.join(hook, script), '754');
                });
                var returnValue;
                var s = spyOn(shell, 'exec').andCallFake(function(cmd, opts, cb) {
                    cb(0, '');
                });
                h.fire('before_build', function(err) {
                    expect(err).not.toBeDefined();
                    if (platform.match(/(win32|win64)/)) {
                        expect(s.calls[0].args[0]).toMatch(/0.bat/);
                        expect(s.calls[1].args[0]).toMatch(/1.bat/);
                    } else {
                        expect(s.calls[0].args[0]).toMatch(/0.sh/);
                        expect(s.calls[1].args[0]).toMatch(/1.sh/);
                    }
                    done();
                });
            });
            it('should pass the project root folder as parameter into the project-level hooks', function(done) {
                var hook = path.join(tempDir, '.cordova', 'hooks', 'before_build');
                shell.mkdir('-p', hook);
                this.after(function() { shell.rm('-rf', tempDir); });
                if (platform.match(/(win32|win64)/)) {
                    shell.cp(path.join(hooks, 'test', '0.bat'), hook);
                } else {
                    shell.cp(path.join(hooks, 'test', '0.sh'), hook);
                }
                fs.readdirSync(hook).forEach(function(script) {
                    fs.chmodSync(path.join(hook, script), '754');
                });
                var s = spyOn(shell, 'exec').andCallFake(function(cmd, opts, cb) {
                    cb(0, '');
                });
                h.fire('before_build', function(err) {
                    expect(err).not.toBeDefined();
                    var param_str;
                    if (platform.match(/(win32|win64)/)) {
                        param_str = '0.bat "'+tempDir+'"';
                    } else { 
                        param_str = '0.sh "'+tempDir+'"'; 
                    }
                    expect(s.calls[0].args[0].indexOf(param_str)).not.toEqual(-1);
                    done();
                });
            });
            describe('module-level hooks', function() {
                var handler = jasmine.createSpy();
                var test_event = 'before_build';
                afterEach(function() {
                    cordova.off(test_event, handler);
                    handler.reset();
                });

                it('should fire handlers using cordova.on', function(done) {
                    cordova.on(test_event, handler);
                    h.fire(test_event, function(err) {
                        expect(handler).toHaveBeenCalled();
                        expect(err).not.toBeDefined();
                        done();
                    });
                });
                it('should pass the project root folder as parameter into the module-level handlers', function(done) {
                    cordova.on(test_event, handler);
                    h.fire(test_event, function(err) {
                        expect(handler).toHaveBeenCalledWith({root:tempDir});
                        expect(err).not.toBeDefined();
                        done();
                    });
                });
                it('should be able to stop listening to events using cordova.off', function(done) {
                    cordova.on(test_event, handler);
                    cordova.off(test_event, handler);
                    h.fire(test_event, function(err) {
                        expect(handler).not.toHaveBeenCalled();
                        done();
                    });
                });
                it('should allow for hook to opt into asynchronous execution and block further hooks from firing using the done callback', function(done) {
                    var h1_fired = false;
                    var timeout = 19;
                    var h1 = function(root, cb) {
                        h1_fired = true;
                        setTimeout(cb, timeout);
                    };
                    var h2_fired = false;
                    var h2 = function() {
                        h2_fired = true;
                    };
                    runs(function() {
                        cordova.on(test_event, h1);
                        cordova.on(test_event, h2);
                        h.fire(test_event, function(err) {
                            done();
                        });
                        expect(h1_fired).toBe(true);
                        expect(h2_fired).toBe(false);
                    });
                    waits(timeout);
                    runs(function() {
                        expect(h2_fired).toBe(true);
                    });
                });
            });
        });
    });
});
