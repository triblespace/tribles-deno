module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'tribles.js',
        libraryTarget: 'umd',
        library: 'tribles'
    },
    resolve: {
        fallback: { "util": require.resolve("util/") }
    }
};