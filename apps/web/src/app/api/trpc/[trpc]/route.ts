export const runtime = "nodejs";

const handler = async (request: Request) => {
	const { default: app } = await import("../../../../../../server/src/index");
	return app.fetch(request);
};

export { handler as GET, handler as POST, handler as OPTIONS };
