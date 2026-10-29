/**
 * 404 Not Found fallback middleware.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
    },
  });
}

module.exports = notFoundHandler;
