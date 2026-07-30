function publicUser(user) {
  const rest = { ...user };
  delete rest.passwordHash;
  delete rest.passwordSalt;
  return rest;
}

function publicUsers(users) {
  return users.map(publicUser);
}

module.exports = { publicUser, publicUsers };
