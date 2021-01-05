const webpack = require('webpack');

module.exports = [{
    mode: "development",
    entry: './src/index.js',
    output: {
        filename: 'tribles.js',
        libraryTarget: 'umd',
        library: 'tribles'
    },
    resolve: {
        fallback: { "util": require.resolve("util/")}}},
{
    mode: "production",
    entry: './src/index.js',
    output: {
        filename: 'tribles.min.js',
        libraryTarget: 'umd',
        library: 'tribles'
    },
    resolve: {
        fallback: { "util": require.resolve("util/")}}}];