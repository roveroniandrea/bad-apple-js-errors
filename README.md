# Bad Apple but it's Javascript errors
Bad Apple video played on terminal.

Each frame is a NodeJS process that tries to execute some bugged functions, throwing an Error. The stack trace is printed on the console, resulting in a single frame. By spawning multiple processes on different scripts, the complete Bad Apple video can be rendered.

### [See video](https://youtu.be/eLO-nH3dcNk)

# How to use
- Clone the project
- `npm i` This repo does not use any dependency, with the exception on Node types
- Install ffmpeg
- Find and download an mp4 version of Bad Apple, renaming as `Touhou__Bad_Apple.mp4`
- `npm run convert_50_50` This takes the mp4 video as input and generates frames as bitmap images on the `frames` folder. The current setting outputs frames at 20fps and 50x50 pixel resolution, but you can specify any value you want (read below for more infos)
- `npm start` Takes all generated bmp frames and executes the animation



# How it works
When an Error is thrown, Node prints its stack trace on stderr, which normally is the console.
For example, this is a stack trace consisting of just one function call:
```
$ node
> function myBuggedFunction() { return null.toString()}
> myBuggedFunction()

Uncaught TypeError: Cannot read properties of null (reading 'toString')
    at myBuggedFunction (REPL10:1:42)
```

We can nest it to create a stack trace with two rows:
```
> function myBuggedFunction2() { return myBuggedFunction()}
> myBuggedFunction2()

Uncaught TypeError: Cannot read properties of null (reading 'toString')
    at myBuggedFunction (REPL1:1:42)
    at myBuggedFunction2 (REPL2:1:38)
```

By correctly naming each function, we can print some ASCII art on it:
```
> function ____$____(){return null.toString()}
> function ___$$$___() {____$____()};
> function __$$$$$__() {___$$$___()};
> function _$$$$$$$_() {__$$$$$__()};
> 
> _$$$$$$$_()
Uncaught TypeError: Cannot read properties of null (reading 'toString')
    at ____$____ (REPL1:1:34)
    at ___$$$___ (REPL2:1:23)
    at __$$$$$__ (REPL3:1:23)
    at _$$$$$$$_ (REPL4:1:23)
```

 The only adjustment needed is to change the maximum stack size that Node has to keep, in order to print all the rows needed:

```js
// Allows to keep and print 50 function calls in the stack trace
Error.stackTraceLimit = 50;
```


The `main.js` process loads all bmp files, and for each of them writes the corresponding js file consisting in a function for each image row,
It then spawns a child process via fork for each frame, piping its stderr to the console. It handles all the timings and clears the console between each frame
