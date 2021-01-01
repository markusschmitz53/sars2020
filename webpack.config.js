const path = require("path");
const fs = require("fs");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const {CleanWebpackPlugin} = require("clean-webpack-plugin");
const appDirectory = fs.realpathSync(process.cwd());
module.exports = {
    entry: path.resolve(appDirectory, "src/app.js"), //path to the main .ts file
    output: {
        filename: "js/sars2020.js", //name for the javascript file that is created/compiled in memory
    },
    resolve: {
        extensions: [".js"],
    },
    devServer: {
        host            : "0.0.0.0",
        port            : 8080, //port that we're using for local host (localhost:8080)
        disableHostCheck: true,
        contentBase     : path.resolve(appDirectory, "public"), //tells webpack to serve from the public folder
        publicPath      : "/",
        hot             : true,
    },
    module: {
        rules: [],
    },
    plugins: [
        new HtmlWebpackPlugin({
                                  inject  : true,
                                  template: path.resolve(appDirectory, "public/index.html"),
                              }),
        new CleanWebpackPlugin(),
    ],
    mode: "development"
};
