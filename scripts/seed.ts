import { PrismaClient, PetSpecies, CircleType, MembershipLevel, CircleVisibility } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ==================== Breed Circle Definitions ====================

interface BreedCircleDef {
  name: string;
  species: PetSpecies;
  description: string;
  coverImage: string;
}

const breedCircles: BreedCircleDef[] = [
  { name: '柯基圈', species: PetSpecies.DOG, description: '短腿大能量 — 柯基犬爱好者的聚集地', coverImage: '' },
  { name: '金毛圈', species: PetSpecies.DOG, description: '暖男大金毛的日常交流圈', coverImage: '' },
  { name: '拉布拉多圈', species: PetSpecies.DOG, description: '拉布拉多饲养经验分享', coverImage: '' },
  { name: '柴犬圈', species: PetSpecies.DOG, description: '豆柴·标准柴犬爱好者交流', coverImage: '' },
  { name: '哈士奇圈', species: PetSpecies.DOG, description: '二哈拆家联盟，又爱又恨', coverImage: '' },
  { name: '泰迪圈', species: PetSpecies.DOG, description: '贵宾/泰迪美容与饲养交流', coverImage: '' },
  { name: '边牧圈', species: PetSpecies.DOG, description: '边境牧羊犬——最聪明的狗狗', coverImage: '' },
  { name: '法斗圈', species: PetSpecies.DOG, description: '法国斗牛犬饲养交流圈', coverImage: '' },
  { name: '博美圈', species: PetSpecies.DOG, description: '博美犬——小狐狸的日常', coverImage: '' },
  { name: '萨摩耶圈', species: PetSpecies.DOG, description: '微笑天使萨摩耶', coverImage: '' },
  { name: '布偶圈', species: PetSpecies.CAT, description: '布偶猫——猫中仙女', coverImage: '' },
  { name: '英短圈', species: PetSpecies.CAT, description: '英国短毛猫蓝胖子交流圈', coverImage: '' },
  { name: '美短圈', species: PetSpecies.CAT, description: '美国短毛猫饲养交流', coverImage: '' },
  { name: '橘猫圈', species: PetSpecies.CAT, description: '十个橘猫九个胖，还有一个压塌炕', coverImage: '' },
  { name: '暹罗圈', species: PetSpecies.CAT, description: '暹罗猫——猫中之狗', coverImage: '' },
  { name: '缅因圈', species: PetSpecies.CAT, description: '缅因猫——温柔的巨人', coverImage: '' },
  { name: '加菲圈', species: PetSpecies.CAT, description: '异国短毛猫（加菲）交流圈', coverImage: '' },
  { name: '苏格兰折耳圈', species: PetSpecies.CAT, description: '折耳猫饲养与健康关注', coverImage: '' },
  { name: '狸花圈', species: PetSpecies.CAT, description: '中华狸花猫——本土好猫', coverImage: '' },
  { name: '中华田园犬圈', species: PetSpecies.DOG, description: '田园犬——最忠实的伙伴', coverImage: '' },
];

// City circles
const cityCircles = [
  { name: '北京宠友圈', city: '北京', description: '北京同城宠友交流圈' },
  { name: '上海宠友圈', city: '上海', description: '上海同城宠友交流圈' },
  { name: '广州宠友圈', city: '广州', description: '广州同城宠友交流圈' },
  { name: '深圳宠友圈', city: '深圳', description: '深圳同城宠友交流圈' },
  { name: '杭州宠友圈', city: '杭州', description: '杭州同城宠友交流圈' },
  { name: '成都宠友圈', city: '成都', description: '成都同城宠友交流圈' },
];

// ==================== Knowledge Article Templates ====================
// (Originally seeded as KnowledgeArticle rows. Now published as posts
// by the PawPal 官方 account into the corresponding breed circle.)
//
// Total: 152 articles (80 dog + 72 cat)

interface ArticleTemplate {
  title: string;
  species: PetSpecies;
  breed: string;
  category: string;
  content: string;
}

function generateArticles(): ArticleTemplate[] {
  const articles: ArticleTemplate[] = [];

  // Generic dog care articles
  const dogCategories = ['疫苗接种', '驱虫指南', '日常饮食', '行为训练', '常见疾病', '美容护理', '运动需求', '心理健康'];
  const dogBreeds = ['柯基', '金毛', '拉布拉多', '柴犬', '哈士奇', '泰迪', '边牧', '法斗', '博美', '萨摩耶'];

  for (const breed of dogBreeds) {
    for (const category of dogCategories) {
      articles.push({
        title: `${breed}${category}完全指南`,
        species: PetSpecies.DOG,
        breed,
        category,
        content: `# ${breed}${category}完全指南\n\n## 概述\n本文将详细介绍${breedHealthContent(breed, category)}`,
      });
    }
  }

  // Generic cat care articles
  const catCategories = ['疫苗接种', '驱虫指南', '日常饮食', '行为解读', '常见疾病', '毛发护理', '环境布置', '遗传病筛查'];
  const catBreeds = ['布偶', '英短', '美短', '橘猫', '暹罗', '缅因', '加菲', '折耳', '狸花'];

  for (const breed of catBreeds) {
    for (const category of catCategories) {
      articles.push({
        title: `${breed}${category}完全指南`,
        species: PetSpecies.CAT,
        breed,
        category,
        content: `# ${breed}${category}完全指南\n\n## 概述\n本文将详细介绍${breedHealthContent(breed, category)}`,
      });
    }
  }

  return articles;
}

function breedHealthContent(breed: string, category: string): string {
  const templates: Record<string, string> = {
    '疫苗接种': `${breed}的疫苗接种是预防传染病的最有效手段。幼犬/幼猫通常在6-8周龄开始接种第一针疫苗，之后每隔3-4周接种一针，共三针。核心疫苗包括犬瘟热、犬细小病毒、犬腺病毒等。成年后每年加强免疫一次。接种前确保宠物健康，接种后观察30分钟有无过敏反应。`,
    '驱虫指南': `${breed}需要定期进行体内外驱虫。体内驱虫一般每3个月一次，常用药物包括米尔贝肟、吡喹酮等。体外驱虫每月一次，可使用福来恩、大宠爱等滴剂。驱虫前后注意观察宠物状态，如出现呕吐、腹泻等症状应及时就医。`,
    '日常饮食': `${breed}的饮食应遵循"营养均衡、定时定量"的原则。幼年期每天喂食3-4次，成年后改为每天2次。建议选择优质商品粮，避免喂食人类食物尤其是巧克力、洋葱、葡萄等有毒食物。保证充足的清洁饮水。`,
    '行为训练': `${breed}智商较高，训练时应采用正向强化法（奖励正确行为）。基础指令包括"坐下""趴下""过来""等待"等。每次训练不超过15分钟，保持趣味性。避免惩罚式训练，以免造成心理阴影。`,
    '行为解读': `${breed}的行为有其独特的含义。摇尾巴不一定代表开心，也可能是紧张或警惕。耳朵朝后表示恐惧或顺从。瞳孔放大可能表示兴奋或攻击前兆。了解这些信号有助于更好地与宠物沟通。`,
    '常见疾病': `${breed}常见的健康问题包括皮肤病、消化问题、耳部感染等。定期体检（建议每年1-2次）可以早期发现问题。注意观察食欲、精神状态、排便情况的变化，异常时及时就医。`,
    '美容护理': `${breed}的美容护理包括毛发梳理、指甲修剪、耳朵清洁、牙齿护理等。长毛品种需要每天梳理以防止打结。指甲每2-3周修剪一次。定期清洁耳道预防耳螨。建议从小培养美容习惯。`,
    '毛发护理': `${breed}的毛发护理根据毛发长度有所不同。短毛品种每周梳理1-2次即可，长毛品种需要每天梳理。换毛季节（春秋）会增加掉毛量，需加强梳理。洗澡频率不宜过高，一般每月1-2次。`,
    '运动需求': `${breed}的运动量需要根据年龄和体型合理安排。成年犬每天至少需要30-60分钟的户外运动。幼犬运动量不宜过大，以免影响骨骼发育。老年犬适当减少运动强度，以散步为主。`,
    '心理健康': `${breed}的心理健康同样重要。分离焦虑是常见问题，可以通过逐步脱敏训练改善。提供丰富的玩具和互动时间。避免长时间独处。定期社交有助于培养稳定性格。`,
    '环境布置': `${breed}的生活环境需要安全、舒适。室内养护需准备猫砂盆、猫爬架、饮水器等。注意封窗防止坠楼。移除有毒植物（百合、绿萝等）。保持环境清洁，定期消毒。`,
    '遗传病筛查': `${breed}可能存在品种遗传性疾病风险。建议在购买/领养时了解父母健康状况。定期进行心脏超声、髋关节X光等筛查。早期发现可以通过饮食管理和药物治疗控制病情发展。`,
  };
  return templates[category] || `本文将详细介绍${breed}在${category}方面的注意事项和最佳实践。`;
}

/**
 * Map an article's breed to the corresponding breed circle.
 * Falls back to a generic "all-dog" or "all-cat" circle if no match.
 */
function findCircleForBreed(
  breed: string,
  species: PetSpecies,
  circles: Array<{ id: string; name: string; species: PetSpecies | null }>,
): { id: string; name: string } | null {
  // Try exact breed match (e.g. "柯基" -> "柯基圈")
  const exact = circles.find(
    (c) => c.name === `${breed}圈` && c.species === species,
  );
  if (exact) return { id: exact.id, name: exact.name };

  // Try contains match
  const partial = circles.find(
    (c) => c.name.includes(breed) && c.species === species,
  );
  if (partial) return { id: partial.id, name: partial.name };

  return null;
}

// ==================== Seed Function ====================

async function seed(): Promise<void> {
  console.log('🌱 Starting PawPal database seed...\n');

  // 1. Create official PawPal account (for publishing knowledge articles as posts)
  const officialPasswordHash = await bcrypt.hash('pawpal-official-2026', 10);
  const official = await prisma.user.upsert({
    where: { email: 'official@pawpal.com' },
    update: {},
    create: {
      email: 'official@pawpal.com',
      passwordHash: officialPasswordHash,
      nickname: 'PawPal 官方',
      bio: 'PawPal 官方账号 — 发布宠物饲养知识文章',
      city: '杭州',
      membershipLevel: MembershipLevel.PREMIUM,
    },
  });
  console.log(`✅ Official PawPal account created: ${official.email}`);

  // 2. Create admin user
  const adminPasswordHash = await bcrypt.hash('admin123456', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pawpal.com' },
    update: {},
    create: {
      email: 'admin@pawpal.com',
      passwordHash: adminPasswordHash,
      nickname: 'PawPal 管理员',
      bio: 'PawPal 官方管理员账号',
      city: '杭州',
      membershipLevel: MembershipLevel.FREE,
    },
  });
  console.log(`✅ Admin user created: ${admin.email}`);

  // 3. Create breed circles (marked as verified official circles)
  console.log('\n📦 Creating breed circles...');
  const breedCircleRecords: Array<{ id: string; name: string; species: PetSpecies | null }> = [];
  for (const circle of breedCircles) {
    const created = await prisma.circle.upsert({
      where: { name: circle.name },
      update: {
        isVerified: true,
        visibility: CircleVisibility.PUBLIC,
        rules: '1. 友善交流，禁止人身攻击\n2. 不发布广告或商业推广\n3. 引用专业资料请标注来源\n4. 涉及医疗问题请咨询兽医',
      },
      create: {
        name: circle.name,
        type: CircleType.BREED,
        species: circle.species,
        description: circle.description,
        coverImage: circle.coverImage,
        isVerified: true,
        visibility: CircleVisibility.PUBLIC,
        rules: '1. 友善交流，禁止人身攻击\n2. 不发布广告或商业推广\n3. 引用专业资料请标注来源\n4. 涉及医疗问题请咨询兽医',
        createdByUserId: official.id,
        ownerId: official.id,
      },
    });
    breedCircleRecords.push({ id: created.id, name: created.name, species: created.species });
  }
  console.log(`✅ Created ${breedCircles.length} breed circles`);

  // Add official user as OWNER of all breed circles
  for (const c of breedCircleRecords) {
    await prisma.circleMember.upsert({
      where: { circleId_userId: { circleId: c.id, userId: official.id } },
      update: { role: 'OWNER', status: 'ACTIVE' },
      create: { circleId: c.id, userId: official.id, role: 'OWNER' },
    });
    // Sync member count
    await prisma.circle.update({
      where: { id: c.id },
      data: { memberCount: 1 },
    });
  }

  // 4. Create city circles
  console.log('\n📦 Creating city circles...');
  for (const circle of cityCircles) {
    await prisma.circle.upsert({
      where: { name: circle.name },
      update: {
        isVerified: true,
        visibility: CircleVisibility.PUBLIC,
        rules: '1. 仅限同城宠友交流\n2. 友善发言，禁止广告\n3. 线下活动请注意安全',
      },
      create: {
        name: circle.name,
        type: CircleType.CITY,
        description: circle.description,
        isVerified: true,
        visibility: CircleVisibility.PUBLIC,
        rules: '1. 仅限同城宠友交流\n2. 友善发言，禁止广告\n3. 线下活动请注意安全',
        createdByUserId: official.id,
        ownerId: official.id,
      },
    });
  }
  console.log(`✅ Created ${cityCircles.length} city circles`);

  // 5. Convert knowledge articles to posts by the official PawPal account.
  //    Each article is posted to its corresponding breed circle.
  console.log('\n📚 Publishing knowledge articles as PawPal 官方 posts...');
  const articles = generateArticles();
  let publishedCount = 0;
  let unmappedCount = 0;

  for (const article of articles) {
    const targetCircle = findCircleForBreed(article.breed, article.species, breedCircleRecords);
    if (!targetCircle) {
      // No matching circle — skip (shouldn't happen with our template data)
      unmappedCount++;
      continue;
    }

    // Check if a post with the same title already exists in this circle
    const existing = await prisma.post.findFirst({
      where: { title: article.title, circleId: targetCircle.id },
    });
    if (existing) {
      continue; // idempotent seed
    }

    await prisma.post.create({
      data: {
        userId: official.id,
        circleId: targetCircle.id,
        title: article.title,
        content: article.content,
        images: [],
        tags: [article.breed, article.category, '知识文章'],
      },
    });
    publishedCount++;
  }

  // Sync circle post counts
  for (const c of breedCircleRecords) {
    const count = await prisma.post.count({ where: { circleId: c.id } });
    await prisma.circle.update({
      where: { id: c.id },
      data: { postCount: count, lastActiveAt: new Date() },
    });
  }

  console.log(`✅ Published ${publishedCount} knowledge articles as posts by PawPal 官方`);
  if (unmappedCount > 0) {
    console.log(`⚠️  ${unmappedCount} articles had no matching circle and were skipped`);
  }

  // 6. Create a demo user with a pet
  const demoPasswordHash = await bcrypt.hash('demo123456', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@pawpal.com' },
    update: {},
    create: {
      email: 'demo@pawpal.com',
      passwordHash: demoPasswordHash,
      nickname: '煤球妈妈',
      bio: '柯基煤球的铲屎官，养狗3年',
      city: '杭州',
    },
  });

  const demoPet = await prisma.pet.create({
    data: {
      userId: demoUser.id,
      name: '煤球',
      species: PetSpecies.DOG,
      breed: '柯基',
      gender: 'MALE',
      birthday: new Date('2023-03-15'),
      weight: 12.5,
      neutered: true,
    },
  });

  // Add a sample health record
  await prisma.healthRecord.create({
    data: {
      petId: demoPet.id,
      type: 'VACCINE',
      date: new Date('2024-03-20'),
      itemName: '狂犬疫苗',
      notes: '年度加强免疫，接种后无不良反应',
      images: [],
    },
  });

  // Add a weight record
  await prisma.weightRecord.create({
    data: {
      petId: demoPet.id,
      weight: 12.5,
      date: new Date('2024-06-01'),
    },
  });

  console.log(`✅ Demo user created: ${demoUser.email} with pet: ${demoPet.name}`);

  // 7. Create a sample community post from the demo user
  const corgiCircle = await prisma.circle.findFirst({ where: { name: '柯基圈' } });
  if (corgiCircle) {
    await prisma.post.create({
      data: {
        userId: demoUser.id,
        circleId: corgiCircle.id,
        petId: demoPet.id,
        title: '煤球的年度体检报告分享',
        content: '今天带煤球做了年度体检，各项指标都正常！分享一下体检流程和注意事项给大家参考。\n\n1. 提前预约，避免排队\n2. 空腹6小时以上\n3. 携带过往疫苗本\n4. 体检项目：血常规、生化、尿检、X光\n\n费用总计约800元，大家有疑问可以在评论区交流~',
        images: [],
        tags: ['柯基', '体检', '健康记录'],
      },
    });
    await prisma.circleMember.upsert({
      where: { circleId_userId: { circleId: corgiCircle.id, userId: demoUser.id } },
      update: {},
      create: { circleId: corgiCircle.id, userId: demoUser.id, role: 'MEMBER' },
    });
    // Sync counts
    const postCount = await prisma.post.count({ where: { circleId: corgiCircle.id } });
    const memberCount = await prisma.circleMember.count({
      where: { circleId: corgiCircle.id, status: 'ACTIVE' },
    });
    await prisma.circle.update({
      where: { id: corgiCircle.id },
      data: { postCount, memberCount, lastActiveAt: new Date() },
    });
  }

  console.log('✅ Sample community post created');

  console.log('\n🎉 Seed completed successfully!');
  console.log(`   - Official: official@pawpal.com / pawpal-official-2026`);
  console.log(`   - Admin:    admin@pawpal.com / admin123456`);
  console.log(`   - Demo:     demo@pawpal.com / demo123456`);
  console.log(`   - Total circles: ${breedCircles.length + cityCircles.length}`);
  console.log(`   - Total knowledge articles published as posts: ${publishedCount}`);
}

seed()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
