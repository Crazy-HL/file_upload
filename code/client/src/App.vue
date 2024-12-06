<template>
	<div>
		<h1>文件上传</h1>
		<input @change="handleUpload" type="file" />
	</div>
</template>

<script setup lang="ts">
	import SparkMD5 from "spark-md5";
	import { ref } from "vue";
	//1MB = 1024KB = 1024*1024 B
	const CHUNK_SIZE = 1024 * 1024; //1M
	//存hash值和文件名
	const fileHash = ref<string>("");
	const fileName = ref<string>("");

	const handleUpload = async (e: Event) => {
		//读取文件
		const files = (e.target as HTMLInputElement).files;
		if (!files) return;
		// console.log(files[0]);

		//文件分片
		const chunks = createChunks(files[0]);
		// console.log(chunks);

		//hash计算
		const hash = await calculateHash(chunks);
		// console.log("myhash:", hash);

		fileHash.value = hash as string;
		fileName.value = files[0].name;

		//校验hash值
		const data = await verify();
		// console.log(data.data.shouldUpload);
		if (!data.data.shouldUpload) {
			alert("秒传：上传成功");
			return;
		}

		//上传分片
		uploadChunks(chunks, data.data.existChunks);
	};

	//文件分片
	const createChunks = (file: File) => {
		let cur = 0;
		let chunks = [];
		while (cur < file.size) {
			const blob = file.slice(cur, cur + CHUNK_SIZE);
			chunks.push(blob);
			cur += CHUNK_SIZE;
		}
		return chunks;
	};

	//hash计算
	const calculateHash = (chunks: Blob[]) => {
		//返回一个Promise对象
		return new Promise(resolve => {
			//1. 第一个和最后一个切片的内容全部参与计算
			//2. 中间剩余的切片分别在前面、后面和中间取2个字节参与计算
			const targets: Blob[] = []; //存储所有参与计算的切片
			const spark = new SparkMD5.ArrayBuffer(); //创建一个 SparkMD5 实例，专门用于处理 ArrayBuffer 类型的数据
			const fileReader = new FileReader(); //创建一个新的 FileReader 实例
			chunks.forEach((chunk, index) => {
				if (index === 0 || index === chunks.length - 1) {
					targets.push(chunk);
				} else {
					targets.push(chunk.slice(0, 2)); //前两个字节
					targets.push(chunk.slice(CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 2)); //中间两个字节
					targets.push(chunk.slice(CHUNK_SIZE - 2, CHUNK_SIZE)); //最后两个字节
				}
			});

			//计算 hash值
			fileReader.readAsArrayBuffer(new Blob(targets)); //使用 FileReader 的 readAsArrayBuffer 方法读取一个 Blob 对象，这个 Blob 对象是由 targets 数组创建的
			//设置 FileReader 的 onload 事件处理函数，当读取操作完成时，这个函数会被调用
			fileReader.onload = e => {
				spark.append((e.target as FileReader).result); // 类型断言确保 e.target 可以作为 FileReader 处理
				// console.log("hash: " + spark.end()); // 计算并打印 MD5 哈希值
				resolve(spark.end());
			};
		});
	};

	//校验hash值
	const verify = () => {
		return fetch("http://localhost:3000/verify", {
			method: "POST",
			headers: {
				"Content-type": "application/json"
			},
			body: JSON.stringify({
				fileHash: fileHash.value,
				fileName: fileName.value
			})
		})
			.then(res => res.json())
			.then(res => {
				return res;
			});
	};

	//上传分片
	const uploadChunks = async (chunks: Blob[], existChunks: string[]) => {
		const data = chunks.map((chunk, index) => {
			return {
				fileHash: fileHash.value,
				chunkHash: fileHash.value + "-" + index,
				chunk
			};
		});

		//把data转成formData对象
		const formDatas = data
			//过滤已经存在的切片
			.filter(item => !existChunks.includes(item.chunkHash))
			.map(item => {
				const formData = new FormData();
				formData.append("fileHash", item.fileHash);
				formData.append("chunkHash", item.chunkHash);
				formData.append("chunk", item.chunk);
				return formData;
			});
		// console.log(formDatas);

		const max = 6; //最大并发请求数
		let index = 0;
		const taskPool: any = []; //请求池
		//为每个FormData对象创建一个fetch请求
		while (index < formDatas.length) {
			const task = fetch("http://localhost:3000/upload", {
				method: "POST",
				body: formDatas[index]
			});

			//使用splice方法移除taskPool中已经完成的任务，然后使用push方法将新的任务添加到taskPool中
			taskPool.splice(
				taskPool.findIndex((item: any) => item === task),
				1
			);
			taskPool.push(task);
			if (taskPool.length === max) {
				await Promise.race(taskPool);
			}
			index++;
		}
		await Promise.all(taskPool);

		//通知服务器合并文件
		mergeRequest();
	};

	const mergeRequest = () => {
		fetch("http://localhost:3000/merge", {
			method: "POST",
			headers: {
				"Content-type": "application/json"
			},
			body: JSON.stringify({
				fileHash: fileHash.value,
				fileName: fileName.value,
				size: CHUNK_SIZE
			})
		}).then(res => {
			alert("合并成功！");
		});
	};
</script>
