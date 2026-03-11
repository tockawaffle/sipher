import * as Minio from "minio";

const MINIO_ENDPOINT_ENV = process.env.MINIO_ENDPOINT;
const MINIO_PORT_ENV = process.env.MINIO_PORT;
const MINIO_USE_SSL_ENV = process.env.MINIO_USE_SSL;
const MINIO_ACCESS_KEY_ENV = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY_ENV = process.env.MINIO_SECRET_KEY;

if (!MINIO_ENDPOINT_ENV || !MINIO_PORT_ENV || !MINIO_USE_SSL_ENV || !MINIO_ACCESS_KEY_ENV || !MINIO_SECRET_KEY_ENV) {
	throw new Error("Missing Minio environment variables");
}

const minioClient = new Minio.Client({
	endPoint: MINIO_ENDPOINT_ENV,
	port: parseInt(MINIO_PORT_ENV),
	useSSL: MINIO_USE_SSL_ENV === "true",
	accessKey: MINIO_ACCESS_KEY_ENV,
	secretKey: MINIO_SECRET_KEY_ENV,
})

export default minioClient;