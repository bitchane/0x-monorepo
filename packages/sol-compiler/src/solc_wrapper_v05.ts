import { CompilerOptions, StandardOutput } from 'ethereum-types';
import * as _ from 'lodash';
import solc = require('solc');

import {
    addHexPrefixToContractBytecode,
    compileDockerAsync,
    compileSolcJSAsync,
    getSolcJSAsync,
    makeContractPathsRelative,
    printCompilationErrorsAndWarnings,
} from './utils/compiler';

import { ALL_CONTRACTS_IDENTIFIER, ALL_FILES_IDENTIFIER } from './compiler';
import { CompilationResult, ContractContentsByPath, DependencyPathByPrefix, SolcWrapper } from './solc_wrapper';

// Solc compiler settings cannot be configured from the commandline.
// If you need this configured, please create a `compiler.json` config file
// with your desired configurations.
export const DEFAULT_COMPILER_SETTINGS: solc.CompilerSettings = {
    optimizer: {
        enabled: false,
    },
    outputSelection: {
        [ALL_FILES_IDENTIFIER]: {
            [ALL_CONTRACTS_IDENTIFIER]: ['abi', 'evm.bytecode.object'],
        },
    },
};

// tslint:disable no-non-null-assertion

export class SolcWrapperV05 extends SolcWrapper {
    protected readonly _compilerSettings: solc.CompilerSettings;

    public static normalizeOutput(
        output: StandardOutput,
        dependencies: DependencyPathByPrefix,
        opts: CompilerOptions,
    ): StandardOutput {
        const _output = _.cloneDeep(output);
        _output.sources = makeContractPathsRelative(_output.sources, opts.contractsDir!, dependencies);
        _output.contracts = makeContractPathsRelative(_output.contracts, opts.contractsDir!, dependencies);
        // tslint:disable-next-line forin
        for (const contractPath in output.contracts) {
            // tslint:disable-next-line forin
            for (const contract of Object.values(output.contracts[contractPath])) {
                addHexPrefixToContractBytecode(contract);
            }
        }
        return _output;
    }

    constructor(protected readonly _solcVersion: string, protected readonly _opts: CompilerOptions) {
        super();
        this._compilerSettings = {
            ...DEFAULT_COMPILER_SETTINGS,
            ..._opts.compilerSettings,
        };
    }

    public get version(): string {
        return this._solcVersion;
    }

    public areCompilerSettingsDifferent(settings: any): boolean {
        return !_.isEqual(_.omit(settings, 'remappings'), _.omit(this._compilerSettings, 'remappings'));
    }

    public async compileAsync(
        contractsByPath: ContractContentsByPath,
        dependencies: DependencyPathByPrefix,
    ): Promise<CompilationResult> {
        const input: solc.StandardInput = {
            language: 'Solidity',
            sources: {},
            settings: {
                remappings: [],
                ...this._compilerSettings,
            },
        };
        for (const [contractPath, contractContent] of Object.entries(contractsByPath)) {
            input.sources[contractPath] = { content: contractContent };
        }
        for (const [prefix, _path] of Object.entries(dependencies)) {
            input.settings.remappings!.push(`${prefix}=${_path}`);
        }
        const output = await this._compileInputAsync(input);
        if (output.errors !== undefined) {
            printCompilationErrorsAndWarnings(output.errors);
        }
        return {
            input,
            output: SolcWrapperV05.normalizeOutput(output, dependencies, this._opts),
        };
    }

    protected async _compileInputAsync(input: solc.StandardInput): Promise<StandardOutput> {
        if (this._opts.useDockerisedSolc) {
            return compileDockerAsync(this._solcVersion, input);
        }
        const solcInstance = await getSolcJSAsync(this._solcVersion, !!this._opts.isOfflineMode);
        return compileSolcJSAsync(solcInstance, input);
    }
}
