import execa from 'execa';
import fs from 'fs';
import {_downloadFile} from './browser/BrowserFetcher';
import type {FfmpegExecutable} from './ffmpeg-executable';
import {binaryExists, ffmpegInNodeModules} from './validate-ffmpeg';

let buildConfig: string | null = null;

export type FfmpegVersion = [number, number, number] | null;

// executes ffmpeg with execa in order to get buildInfos which then can be used elsewhere?
export const getFfmpegBuildInfo = async (options: {
	ffmpegExecutable: string | null;
}) => {
	if (buildConfig !== null) {
		return buildConfig;
	}

	const data = await execa(
		await getExecutableFfmpeg(options.ffmpegExecutable),
		// options.ffmpegExecutable ?? 'ffmpeg',
		['-buildconf'],
		{
			reject: false,
		}
	);
	buildConfig = data.stderr;
	return buildConfig;
};

export const ffmpegHasFeature = async ({
	ffmpegExecutable,
	feature,
	isLambda,
}: {
	ffmpegExecutable: string | null;
	feature: 'enable-gpl' | 'enable-libx265' | 'enable-libvpx';
	isLambda: boolean;
}) => {
	if (isLambda) {
		// When rendering in the cloud, we don't need a local binary
		return true;
	}

	// cant have feature if ffmpeg doesnt even exist
	if (!(await binaryExists('ffmpeg', ffmpegExecutable))) {
		return false;
	}

	const config = await getFfmpegBuildInfo({ffmpegExecutable});
	return config.includes(feature);
};

export const parseFfmpegVersion = (buildconf: string): FfmpegVersion => {
	const match = buildconf.match(
		/ffmpeg version ([0-9]+).([0-9]+)(?:.([0-9]+))?/
	);
	if (!match) {
		return null;
	}

	return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
};

export const getFfmpegVersion = async (options: {
	ffmpegExecutable: string | null;
}): Promise<FfmpegVersion> => {
	const buildInfo = await getFfmpegBuildInfo({
		ffmpegExecutable: options.ffmpegExecutable,
	});
	return parseFfmpegVersion(buildInfo);
};

export const downloadFfmpeg = async (): Promise<void> => {
	const decoyFunction = () => {
		return undefined;
	};

	const os = require('os');
	const path = require('path');
	if (!fs.existsSync(path.resolve(process.cwd(), 'node_modules/.ffmpeg'))) {
		fs.mkdirSync(path.resolve(process.cwd(), 'node_modules/.ffmpeg'));
	}

	const destinationPath = path.resolve(
		process.cwd(),
		'node_modules/.ffmpeg/ffmpeg'
	);
	console.log(destinationPath);
	let url: string;

	const isWin = os.platform() === 'win32';

	if (isWin) {
		url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-full.7z';
	} else {
		// has to be extended for linux etc
		url =
			'https://remotion-ffmpeg-binaries.s3.eu-central-1.amazonaws.com/ffmpeg-macos-arm64';
	}

	try {
		await _downloadFile(url, destinationPath, decoyFunction);
		if (!isWin) {
			fs.chmodSync(destinationPath, '755');
		}
	} catch (error) {
		console.log(error);
	}
};

const getFfmpegBinaryFromNodeModules = () => {
	const os = require('os');
	const isWin = os.platform() === 'win32';
	const path = require('path');
	if (isWin) {
		return path.resolve(
			process.cwd(),
			'node_modules/.ffmpeg/ffmpeg-2022-09-19-full_build/bin',
			'ffmpeg.exe'
		);
	}

	return path.resolve(process.cwd(), 'node_modules/.ffmpeg/ffmpeg');
};

// should check if ffmpeg is installed. If installed, return "ffmpeg" else return path to ffmpeg.exe in node modules
export const getExecutableFfmpeg = async (
	ffmpegExecutable: FfmpegExecutable | null
) => {
	const os = require('os');
	const isWin = os.platform() === 'win32';
	const path = require('path');
	if (await binaryExists('ffmpeg', ffmpegExecutable)) {
		return 'ffmpeg';
	}

	// this part might change a bit after the automatic download is implemented
	if (await ffmpegInNodeModules()) {
		if (!isWin) {
			return path.resolve(process.cwd(), 'node_modules/.ffmpeg/ffmpeg');
		}

		return path.resolve(
			process.cwd(),
			'node_modules/.ffmpeg/ffmpeg-2022-09-19-full_build/bin',
			'ffmpeg.exe'
		);
	}

	await downloadFfmpeg();

	return getFfmpegBinaryFromNodeModules();
};
