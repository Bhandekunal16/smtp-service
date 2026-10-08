const { nodemailer } = require("../provider/dependency.map");
const {
  SMTP_HOST: host,
  SMTP_USER: user,
  SMTP_PASSWORD: pass,
  SMTP_PORT: port,
  SUBJECT_NOT_FOUND,
  TO_NOT_FOUND,
} = require("../provider/config.map");

module.exports = async function send(to, subject, options) {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: {
      user,
      pass,
    },
  });

  if (!to) return TO_NOT_FOUND;
  if (!subject) return SUBJECT_NOT_FOUND;

  let payload = { from: user, to, subject, ...options };

  const res = await transporter.sendMail(payload);

  const {
    messageId,
    messageSize,
    messageTime,
    response,
    rejected,
    rejectedErrors,
  } = res;

  return {
    response: {
      messageId,
      messageSize,
      messageTime,
      response,
      rejected,
      rejectedErrors,
    },
    status: true,
    statusCode: 200,
  };
};
