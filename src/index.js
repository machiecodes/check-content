import * as github from '@actions/github';
import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";

const token = process.env.GITHUB_TOKEN;
const label = core.getInput('close-label');

const context = github.context;

(async () => {

})();