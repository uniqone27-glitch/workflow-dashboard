// 업무 기준 정보 — 카테고리/옵션 목록을 늘리려면 이 파일만 수정하면 됩니다.

export const ROLES = {
  admin: '관리자',
  logistics: '물류/발주팀',
  brand: '브랜드팀',
  design: '디자인팀',
  pending: '승인 대기',
};

export const STATUSES = ['요청', '작업중', '완료'];
export const PRIORITIES = ['긴급', '높음', '보통', '낮음'];
export const PRIORITY_RANK = { 긴급: 0, 높음: 1, 보통: 2, 낮음: 3 };
export const PRODUCT_KINDS = ['신제품', '리뉴얼', '패키지 변경', '기존 제품'];
export const LAUNCH_STATES = ['준비 전', '준비중', '론칭 준비 완료', '론칭 완료'];
export const NEED_STATES = ['미정', '필요', '불필요'];

// 업무 유형별 메타 정보
export const KINDS = {
  package: {
    table: 'package_requests', label: '패키지 디자인 요청', short: '패키지',
    requester: 'logistics', route: 'package',
    workCols: ['status', 'assignee_id', 'expected_date', 'work_memo', 'work_url', 'result_url', 'completed_date'],
  },
  shoot: {
    table: 'shoot_requests', label: '촬영 요청', short: '촬영',
    requester: 'brand', route: 'shoot',
    workCols: ['status', 'assignee_id', 'scheduled_date', 'expected_date', 'work_memo', 'result_url', 'completed_date'],
  },
  design: {
    table: 'design_requests', label: '디자인 작업 요청', short: '디자인',
    requester: 'brand', route: 'design',
    workCols: ['status', 'assignee_id', 'expected_date', 'work_memo', 'figma_url', 'result_url', 'completed_date'],
  },
};

export const PACKAGE_TYPES = ['제품 박스', '라벨', '스티커', '설명서', '기타'];
export const SHOOT_PURPOSES = ['신제품 론칭', '제품 리뉴얼', '상세페이지 개선', '썸네일 변경', '광고 콘텐츠 제작', 'SNS 콘텐츠 제작', '기타'];
export const SHOOT_TYPES = ['제품 누끼 촬영', '제품 단독 연출 촬영', '공간 스타일링 촬영', '제품 디테일 촬영', '기능 시연 촬영', '영상 촬영', '기타'];
export const SHOOT_LOCATIONS = ['사내 스튜디오', '외부 스튜디오', '쇼룸', '고객 공간/야외', '기타'];
export const CHANNELS = ['자사몰', '스마트스토어', '쿠팡', '오늘의집', '인스타그램', '유튜브', '메타 광고', '네이버 광고', '기타'];

// 공통 상세 사양
export const COMMON_SPECS = [
  { key: 'color', label: '컬러' },
  { key: 'size', label: '사이즈' },
  { key: 'material', label: '소재' },
  { key: 'design_feature', label: '디자인 특징' },
  { key: 'main_function', label: '주요 기능' },
  { key: 'components', label: '제품 구성품' },
  { key: 'caution', label: '특이사항 및 유의사항', type: 'textarea', wide: true },
];

const YN = ['있음', '없음'];

// 카테고리별 상세 사양 (카테고리 추가 시 여기에 항목을 정의)
export const CATEGORY_SPECS = {
  테이블: [
    { key: 'top_color', label: '상판 컬러' },
    { key: 'frame_color', label: '프레임 컬러' },
    { key: 'top_material', label: '상판 소재' },
    { key: 'under_frame_material', label: '상판 하부 프레임 소재' },
    { key: 'leg_material', label: '다리/프레임 소재' },
    { key: 'dimension', label: '가로 × 세로 × 높이 (mm)' },
    { key: 'top_thickness', label: '상판 두께' },
    { key: 'frame_thickness', label: '프레임 두께' },
    { key: 'shape', label: '디자인 형태', options: ['직선', '유선', '라운드', '아치형', '기타'] },
    { key: 'leveler', label: '조절발 유무', options: YN },
    { key: 'assembly', label: '조립 방식', options: ['완제품', '반조립', 'DIY 조립'] },
    { key: 'etc_function', label: '기타 기능' },
  ],
  체어: [
    { key: 'seat_color', label: '좌판/쿠션 컬러' },
    { key: 'frame_color', label: '프레임 컬러' },
    { key: 'seat_material', label: '좌판 소재' },
    { key: 'back_material', label: '등받이 소재' },
    { key: 'frame_material', label: '프레임 소재' },
    { key: 'dimension', label: '전체 폭 × 깊이 × 높이 (mm)' },
    { key: 'seat_height', label: '좌판 높이' },
    { key: 'seat_thickness', label: '좌판 두께' },
    { key: 'back_design', label: '등받이 디자인' },
    { key: 'armrest', label: '팔걸이 유무', options: YN },
    { key: 'swivel', label: '회전 기능 유무', options: YN },
    { key: 'etc_function', label: '기타 기능' },
  ],
  '책장/수납장': [
    { key: 'body_color', label: '본체 컬러' },
    { key: 'frame_color', label: '프레임 컬러' },
    { key: 'shelf_material', label: '선반/본체 소재' },
    { key: 'frame_material', label: '프레임 소재' },
    { key: 'dimension', label: '가로 × 깊이 × 높이 (mm)' },
    { key: 'shelf_thickness', label: '선반 두께' },
    { key: 'shelf_gap', label: '선반 간격' },
    { key: 'shelf_count', label: '선반 개수' },
    { key: 'reinforcement', label: '보강 구조 (X 와이어 등)' },
    { key: 'wall_fix', label: '벽 고정 여부', options: ['필요', '선택', '불필요'] },
    { key: 'etc_function', label: '기타 기능' },
  ],
  소파: [
    { key: 'fabric_color', label: '패브릭/가죽 컬러' },
    { key: 'frame_color', label: '프레임/다리 컬러' },
    { key: 'fabric_material', label: '커버 소재' },
    { key: 'frame_material', label: '프레임 소재' },
    { key: 'filling', label: '충전재 (쿠션 구성)' },
    { key: 'dimension', label: '폭 × 깊이 × 높이 (mm)' },
    { key: 'seat_height', label: '좌석 높이' },
    { key: 'seats', label: '인승', options: ['1인', '2인', '3인', '4인 이상', '모듈형'] },
    { key: 'cover', label: '커버 분리 세탁', options: ['가능', '불가'] },
    { key: 'reclining', label: '리클라이닝', options: YN },
    { key: 'etc_function', label: '기타 기능' },
  ],
  침대: [
    { key: 'frame_color', label: '프레임 컬러' },
    { key: 'headboard_material', label: '헤드보드 소재' },
    { key: 'frame_material', label: '프레임 소재' },
    { key: 'bed_size', label: '사이즈 규격', options: ['SS', 'Q', 'K', 'LK', '기타'] },
    { key: 'dimension', label: '폭 × 길이 × 높이 (mm)' },
    { key: 'under_height', label: '하부 높이' },
    { key: 'slat', label: '깔판 구조' },
    { key: 'storage', label: '수납 기능', options: YN },
    { key: 'mattress', label: '매트리스 포함', options: ['포함', '미포함'] },
    { key: 'etc_function', label: '기타 기능' },
  ],
  기타: [],
};
export const CATEGORIES = Object.keys(CATEGORY_SPECS);

export function specLabel(key) {
  const all = [...COMMON_SPECS, ...Object.values(CATEGORY_SPECS).flat()];
  return all.find((s) => s.key === key)?.label ?? key;
}

// 이력 표시용 컬럼 한글명
export const FIELD_LABELS = {
  status: '상태', assignee_id: '담당자', expected_date: '예상 완료일', work_memo: '작업 메모',
  work_url: '작업 파일 URL', result_url: '결과물 URL', figma_url: 'Figma URL', completed_date: '실제 완료일',
  scheduled_date: '촬영 예정일', priority: '우선순위', due_date: '희망 완료일', cancelled: '취소',
  cancel_reason: '취소 사유', design_type: '디자인 유형', design_type_etc: '디자인 유형(기타)',
  package_spec: '패키지 규격', required_text: '필수 기재 문구', print_notes: '인쇄 유의사항',
  reference_url: '레퍼런스 URL', request_note: '추가 요청사항', purpose: '목적', purpose_etc: '목적(기타)',
  shoot_types: '촬영 유형', shoot_types_etc: '촬영 유형(기타)', location: '촬영 장소', location_etc: '촬영 장소(기타)',
  shoot_options: '촬영 옵션', quantity: '촬영 수량', caution: '유의사항', desired_shoot_date: '촬영 희망일',
  work_type: '작업 유형', title: '작업명', channels: '사용 위치', channels_etc: '사용 위치(기타)',
  plan_url: '기획안 URL', brand_id: '브랜드', product_id: '제품', shoot_request_id: '연결 촬영',
  online_name: '온라인 제품명', retail_name: '유통 제품명', sku: '제품 코드/SKU', category: '카테고리',
  product_kind: '요청 구분', arrival_date: '입고 예정일', specs: '상세 사양', options: '옵션',
  spec_changes: '사양 변경사항', spec_notes: '추가 설명', followup: '후속 업무', shoot_needed: '촬영 필요',
  detail_needed: '상세페이지 필요', thumb_needed: '썸네일 필요', launch_date: '론칭 예정일',
  launch_state: '론칭 준비 상태', note: '메모',
};
