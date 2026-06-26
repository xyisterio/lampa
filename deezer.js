/* Deezer Music Plugin for Lampa
   Proxy: https://lufts-dzmedia.fly.dev
   Decrypts Blowfish CBC stream in-browser via MediaSource API
   Login: ARL-token stored in Lampa.Storage */
(function(){
'use strict';

/* ─── Config ──────────────────────────────────────────────────────────────── */
var PROXY   = 'https://lufts-dzmedia.fly.dev';
var DEEZER  = 'https://api.deezer.com';
var SECRET  = 'g4el58wc0zvf9na1';
var SKEY    = 'deezer_arl';           // Storage key for ARL token

/* ─── Blowfish P-array (pi digits) ───────────────────────────────────────── */
var BFP=[0x243F6A88,0x85A308D3,0x13198A2E,0x03707344,0xA4093822,0x299F31D0,
         0x082EFA98,0xEC4E6C89,0x452821E6,0x38D01377,0xBE5466CF,0x34E90C6C,
         0xC0AC29B7,0xC97C50DD,0x3F84D5B5,0xB5470917,0x9216D5D9,0x8979FB1B];

/* ─── Blowfish S0 ─────────────────────────────────────────────────────────── */
var BFS0=[0xD1310BA6,0x98DFB5AC,0x2FFD72DB,0xD01ADFB7,0xB8E1AFED,0x6A267E96,0xBA7C9045,0xF12C7F99,
0x24A19947,0xB3916CF7,0x0801F2E2,0x858EFC16,0x636920D8,0x71574E69,0xA458FEA3,0xF4933D7E,
0x0D95748F,0x728EB658,0x718BCD58,0x82154AEE,0x7B54A41D,0xC25A59B5,0x9C30D539,0x2AF26013,
0xC5D1B023,0x286085F0,0xCA417918,0xB8DB38EF,0x8E79DCB0,0x603A180E,0x6C9E0E8B,0xB01E8A3E,
0xD71577C1,0xBD314B27,0x78AF2FDA,0x55605C60,0xE65525F3,0xAA55AB94,0x57489862,0x63E81440,
0x55CA396A,0x2AAB10B6,0xB4CC5C34,0x1141E8CE,0xA15486AF,0x7C72E993,0xB3EE1411,0x636FBC2A,
0x2BA9C55D,0x741831F6,0xCE5C3E16,0x9B87931E,0xAFD6BA33,0x6C24CF5C,0x7A325381,0x28958677,
0x3B8F4898,0x6B4BB9AF,0xC4BFE81B,0x66282193,0x61D809CC,0xFB21A991,0x487CAC60,0x5DEC8032,
0xEF845D5D,0xE98575B1,0xDC262302,0xEB651B88,0x23893E81,0xD396ACC5,0x0F6D6FF3,0x83F44239,
0x2E0B4482,0xA4842004,0x69C8F04A,0x9E1F9B5E,0x21C66842,0xF6E96C9A,0x670C9C61,0xABD388F0,
0x6A51A0D2,0xD8542F68,0x960FA728,0xAB5133A3,0x6EEF0B6C,0x137A3BE4,0xBA3BF050,0x7EFB2A98,
0xA1F1651D,0x39AF0176,0x66CA593E,0x82430E88,0x8CEE8619,0x456F9FB4,0x7D84A5C3,0x3B8B5EBE,
0xE06F75D8,0x85C12073,0x401A449F,0x56C16AA6,0x4ED3AA62,0x363F7706,0x1BFEDF72,0x429B023D,
0x37D0D724,0xD00A1248,0xDB0FEAD3,0x49F1C09B,0x075372C9,0x80991B7B,0x25D479D8,0xF6E8DEF7,
0xE3FE501A,0xB6794C3B,0x976CE0BD,0x04C006BA,0xC1A94FB6,0x409F60C4,0x5E5C9EC2,0x196A2463,
0x68FB6FAF,0x3E6C53B5,0x1339B2EB,0x3B52EC6F,0x6DFC511F,0x9B30952C,0xCC814544,0xAF5EBD09,
0xBEE3D004,0xDE334AFD,0x660F2807,0x192E4BB3,0xC0CBA857,0x45C8740F,0xD20B5F39,0xB9D3FBDB,
0x5579C0BD,0x1A60320A,0xD6A100C6,0x402C7279,0x679F25FE,0xFB1FA3CC,0x8EA5E9F8,0xDB3222F8,
0x3C7516DF,0xFD616B15,0x2F501EC8,0xAD0552AB,0x323DB5FA,0xFD238760,0x53317B48,0x3E00DF82,
0x9E5C57BB,0xCA6F8CA0,0x1A87562E,0xDF1769DB,0xD542A8F6,0x287EFFC3,0xAC6732C6,0x8C4F5573,
0x695B27B0,0xBBCA58C8,0xE1FFA35D,0xB8F011A0,0x10FA3D98,0xFD2183B8,0x4AFCB56C,0x2DD1D35B,
0x9A53E479,0xB6F84565,0xD28E49BC,0x4BFB9790,0xE1DDF2DA,0xA4CB7E33,0x62FB1341,0xCEE4C6E8,
0xEF20CADA,0x36774C01,0xD07E9EFE,0x2BF11FB4,0x95DBDA4D,0xAE909198,0xEAAD8E71,0x6B93D5A0,
0xD08ED1D0,0xAFC725E0,0x8E3C5B2F,0x8E7594B7,0x8FF6E2FB,0xF2122B64,0x8888B812,0x900DF01C,
0x4FAD5EA0,0x688FC31C,0xD1CFF191,0xB3A8C1AD,0x2F2F2218,0xBE0E1777,0xEA752DFE,0x8B021FA1,
0xE5A0CC0F,0xB56F74E8,0x18ACF3D6,0xCE89E299,0xB4A84FE0,0xFD13E0B7,0x7CC43B81,0xD2ADA8D9,
0x165FA266,0x80957705,0x93CC7314,0x211A1477,0xE6AD2065,0x77B5FA86,0xC75442F5,0xFB9D35CF,
0xEBCDAF0C,0x7B3E89A0,0xD6411BD3,0xAE1E7E49,0x00250E2D,0x2071B35E,0x226800BB,0x57B8E0AF,
0x2464369B,0xF009B91E,0x5563911D,0x59DFA6AA,0x78C14389,0xD95A537F,0x207D5BA2,0x02E5B9C5,
0x83260376,0x6295CFA9,0x11C81968,0x4E734A41,0xB3472DCA,0x7B14A94A,0x1B510052,0x9A532915,
0xD60F573F,0xBC9BC6E4,0x2B60A476,0x81E67400,0x08BA6FB5,0x571BE91F,0xF296EC6B,0x2A0DD915,
0xB6636521,0xE7B9F9B6,0xFF34052E,0xC5855664,0x53B02D5D,0xA99F8FA1,0x08BA4799,0x6E85076A];
/* ─── Blowfish S1 ─────────────────────────────────────────────────────────── */
var BFS1=[0x4B7A70E9,0xB5B32944,0xDB75092E,0xC4192623,0xAD6EA6B0,0x49A7DF7D,0x9CEE60B8,0x8FEDB266,
0xECAA8C71,0x699A17FF,0x5664526C,0xC2B19EE1,0x193602A5,0x75094C29,0xA0591340,0xE4183A3E,
0x3F54989A,0x5B429D65,0x6B8FE4D6,0x99F73FD6,0xA1D29C07,0xEFE830F5,0x4D2D38E6,0xF0255DC1,
0x4CDD2086,0x8470EB26,0x6382E9C6,0x021ECC5E,0x09686B3F,0x3EBAEFC9,0x3C971814,0x6B6A70A1,
0x687F3584,0x52A0E286,0xB79C5305,0xAA500737,0x3E07841C,0x7FDEAE5C,0x8E7D44EC,0x5716F2B8,
0xB03ADA37,0xF0500C0D,0xF01C1F04,0x0200B3FF,0xAE0CF51A,0x3CB574B2,0x25837A58,0xDC0921BD,
0xD19113F9,0x7CA92FF6,0x94324773,0x22F54701,0x3AE5E581,0x37C2DADC,0xC8B57634,0x9AF3DDA7,
0xA9446146,0x0FD0030E,0xECC8C73E,0xA4751E41,0xE238CD99,0x3BEA0E2F,0x3280BBA1,0x183EB331,
0x4E548B38,0x4F6DB908,0x6F420D03,0xF60A04BF,0x2CB81290,0x24977C79,0x5679B072,0xBCAF89AF,
0xDE9A771F,0xD9930810,0xB38BAE12,0xDCCF3F2E,0x5512721F,0x2E6B7124,0x501ADDE6,0x9F84CD87,
0x7A584718,0x7408DA17,0xBC9F9ABC,0xE94B7D8C,0xEC7AEC3A,0xDB851DFA,0x63094366,0xC464C3D2,
0xEF1C1847,0x3215D908,0xDD433B37,0x24C2BA16,0x12A14D43,0x2A65C451,0x50940002,0x133AE4DD,
0x71DFF89E,0x10314E55,0x81AC77D6,0x5F11199B,0x043556F1,0xD7A3C76B,0x3C11183B,0x5924A509,
0xF28FE6ED,0x97F1FBFA,0x9EBABF2C,0x1E153C6E,0x86E34570,0xEAE96FB1,0x860E5E0A,0x5A3E2AB3,
0x771FE71C,0x4E3D06FA,0x2965DCB9,0x99E71D0F,0x803E89D6,0x5266C825,0x2E4CC978,0x9C10B36A,
0xC6150EBA,0x94E2EA78,0xA5FC3C53,0x1E0A2DF4,0xF2F74EA7,0x361D2B3D,0x1939260F,0x19C27960,
0x5223A708,0xF71312B6,0xEBADFE6E,0xEAC31F66,0xE3BC4595,0xA67BC883,0xB17F37D1,0x018CFF28,
0xC332DDEF,0xBE6C5AA5,0x65582185,0x68AB9802,0xEECEA50F,0xDB2F953B,0x2AEF7DAD,0x5B6E2F84,
0x1521B628,0x29076170,0xECDD4775,0x619F1510,0x13CCA830,0xEB61BD96,0x0334FE1E,0xAA0363CF,
0xB5735C90,0x4C70A239,0xD59E9E0B,0xCBAADE14,0xEECC86BC,0x60622CA7,0x9CAB5CAB,0xB2F3846E,
0x648B1EAF,0x19BDF0CA,0xA02369B9,0x655ABB50,0x40685A32,0x3C2AB4B3,0x319EE9D5,0xC021B8F7,
0x9B540B19,0x875FA099,0x95F7997E,0x623D7DA8,0xF837889A,0x97E32D77,0x11ED935F,0x16681281,
0x0E358829,0xC7E61FD6,0x96DEDFA1,0x7858BA99,0x57F584A5,0x1B227263,0x9B83C3FF,0x1AC24696,
0xCDB30AEB,0x532E3054,0x8FD948E4,0x6DBC3128,0x58EBF2EF,0x34C6FFEA,0xFE28ED61,0xEE7C3C73,
0x5D4A14D9,0xE864B7E3,0x42105D14,0x203E13E0,0x45EEE2B6,0xA3AAABEA,0xDB6C4F15,0xFACB4FD0,
0xC742F442,0xEF6ABBB5,0x654F3B1D,0x41CD2105,0xD81E799E,0x86854DC7,0xE44B476A,0x3D816250,
0xCF62A1F2,0x5B8D2646,0xFC8883A0,0xC1C7B6A3,0x7F1524C3,0x69CB7492,0x47848A0B,0x5692B285,
0x095BBF00,0xAD19489D,0x1462B174,0x23820E00,0x58428D2A,0x0C55F5EA,0x1DADF43E,0x233F7061,
0x3372F092,0x8D937E41,0xD65FECF1,0x6C223BDB,0x7CDE3759,0xCBEE7460,0x4085F2A7,0xCE77326E,
0xA6078084,0x19F8509E,0xE8EFD855,0x61D99735,0xA969A7AA,0xC50C06C2,0x5A04ABFC,0x800BCADC,
0x9E447A2E,0xC3453484,0xFDD56705,0x0E1E9EC9,0xDB73DBD3,0x105588CD,0x675FDA79,0xE3674340,
0xC5C43465,0x713E38D8,0x3D28F89E,0xF16DFF20,0x153E21E7,0x8FB03D4A,0xE6E39F2B,0xDB83ADF7];
/* ─── Blowfish S2 ─────────────────────────────────────────────────────────── */
var BFS2=[0xE93D5A68,0x948140F7,0xF64C261C,0x94692934,0x411520F7,0x7602D4F7,0xBCF46B2E,0xD4A20068,
0xD4082471,0x3320F46A,0x43B7D4B7,0x500061AF,0x1E39F62E,0x97244546,0x14214F74,0xBF8B8840,
0x4D95FC1D,0x96B591AF,0x70F4DDD3,0x66A02F45,0xBFBC09EC,0x03BD9785,0x7FAC6DD0,0x31CB8504,
0x96EB27B3,0x55FD3941,0xDA2547E6,0xABCA0A9A,0x28507825,0x530429F4,0x0A2C86DA,0xE9B66DFB,
0x68DC1462,0xD7486900,0x680EC0A4,0x27A18DEE,0x4F3FFEA2,0xE887AD8C,0xB58CE006,0x7AF4D6B6,
0xAACE1E7C,0xD3375FEC,0xCE78A399,0x406B2A42,0x20FE9E35,0xD9F385B9,0xEE39D7AB,0x3B124E8B,
0x1DC9FAF7,0x4B6D1856,0x26A36631,0xEAE397B2,0x3A6EFA74,0xDD5B4332,0x6841E7F7,0xCA7820FB,
0xFB0AF54E,0xD8FEB397,0x454056AC,0xBA489527,0x55533A3A,0x20838D87,0xFE6BA9B7,0xD096954B,
0x55A867BC,0xA1159A58,0xCCA92963,0x99E1DB33,0xA62A4A56,0x3F3125F9,0x5EF47E1C,0x9029317C,
0xFDF8E802,0x04272F70,0x80BB155C,0x05282CE3,0x95C11548,0xE4C66D22,0x48C1133F,0xC70F86DC,
0x07F9C9EE,0x41041F0F,0x404779A4,0x5D886E17,0x325F51EB,0xD59BC0D1,0xF2BCC18F,0x41113564,
0x257B7834,0x602A9C60,0xDFF8E8A3,0x1F636C1B,0x0E12B4C2,0x02E1329E,0xAF664FD1,0xCAD18115,
0x6B2395E0,0x333E92E1,0x3B240B62,0xEEBEB922,0x85B2A20E,0xE6BA0D99,0xDE720C8C,0x2DA2F728,
0xD0127845,0x95B794FD,0x647D0862,0xE7CCF5F0,0x5449A36F,0x877D48FA,0xC39DFD27,0xF33E8D1E,
0x0A476341,0x992EFF74,0x3A6F6EAB,0xF4F8FD37,0xA812DC60,0xA1EBDDF8,0x991BE14C,0xDB6E6B0D,
0xC67B5510,0x6D672C37,0x2765D43B,0xDCD0E804,0xF1290DC7,0xCC00FFA3,0xB5390F92,0x690FED0B,
0x667B9FFB,0xCEDB7D9C,0xA091CF0B,0xD9155EA3,0xBB132F88,0x515BAD24,0x7B9479BF,0x763BD6EB,
0x37392EB3,0xCC115979,0x8026E297,0xF42E312D,0x6842ADA7,0xC66A2B3B,0x12754CCC,0x782EF11C,
0x6A124237,0xB79251E7,0x06A1BBE6,0x4BFB6350,0x1A6B1018,0x11CAEDFA,0x3D25BDD8,0xE2E1C3C9,
0x44421659,0x0A121386,0xD90CEC6E,0xD5ABEA2A,0x64AF674E,0xDA86A85F,0xBEBFE988,0x64E4C3FE,
0x9DBC8057,0xF0F7C086,0x60787BF8,0x6003604D,0xD1FD8346,0xF6381FB0,0x7745AE04,0xD736FCCC,
0x83426B33,0xF01EAB71,0xB0804187,0x3C005E5F,0x77A057BE,0xBDE8AE24,0x55464299,0xBF582E61,
0x4E58F48F,0xF2DDFDA2,0xF474EF38,0x8789BDC2,0x5366F9C3,0xC8B38E74,0xB475F255,0x46FCD9B9,
0x7AEB2661,0x8B1DDF84,0x846A0E79,0x915F95E2,0x466E598E,0x20B45770,0x8CD55591,0xC902DE4C,
0xB90BACE1,0xBB8205D0,0x11A86248,0x7574A99E,0xB77F19B6,0xE0A9DC09,0x662D09A1,0xC4324633,
0xE85A1F02,0x09F0BE8C,0x4A99A025,0x1D6EFE10,0x1AB93D1D,0x0BA5A4DF,0xA186F20F,0x2868F169,
0xDCB7DA83,0x573906FE,0xA1E2CE9B,0x4FCD7F52,0x50115E01,0xA70683FA,0xA002B5C4,0x0DE6D027,
0x9AF88C27,0x773F8641,0xC3604C06,0x61A806B5,0xF0177A28,0xC0F586E0,0x006058AA,0x30DC7D62,
0x11E69ED7,0x2338EA63,0x53C2DD94,0xC2C21634,0xBBCBEE56,0x90BCB6DE,0xEBFC7DA1,0xCE591D76,
0x6F05E409,0x4B7C0188,0x39720A3D,0x7C927C24,0x86E3725F,0x724D9DB9,0x1AC15BB4,0xD39EB8FC,
0xED545578,0x08FCA5B5,0xD83D7CD3,0x4DAD0FC4,0x1E50EF5E,0xB161E6F8,0xA28514D9,0x6C51133C,
0x6FD5C7E7,0x56E14EC4,0x362ABFCE,0xDDC6C837,0xD79A3234,0x92638212,0x670EFA8E,0x406000E0];
/* ─── Blowfish S3 ─────────────────────────────────────────────────────────── */
var BFS3=[0x3A39CE37,0xD3FAF5CF,0xABC27737,0x5AC52D1B,0x5CB0679E,0x4FA33742,0xD3822740,0x99BC9BBE,
0xD5118E9D,0xBF0F7315,0xD62D1C7E,0xC700C47B,0xB78C1B6B,0x21A19045,0xB26EB1BE,0x6A366EB4,
0x5748AB2F,0xBC946E79,0xC6A376D2,0x6549C2C8,0x530FF8EE,0x468DDE7D,0xD5730A1D,0x4CD04DC6,
0x2939BBDB,0xA9BA4650,0xAC9526E8,0xBE5EE304,0xA1FAD5F0,0x6A2D519A,0x63EF8CE2,0x9A86EE22,
0xC089C2B8,0x43242EF6,0xA51E03AA,0x9CF2D0A4,0x83C061BA,0x9BE96A4D,0x8FE51550,0xBA645BD6,
0x2826A2F9,0xA73A3AE1,0x4BA99586,0xEF5562E9,0xC72FEFD3,0xF752F7DA,0x3F046F69,0x77FA0A59,
0x80E4A915,0x87B08601,0x9B09E6AD,0x3B3EE593,0xE990FD5A,0x9E34D797,0x2CF0B7D9,0x022B8B51,
0x96D5AC3A,0x017DA67D,0xD1CF3ED6,0x7C7D2D28,0x1F9F25CF,0xADF2B89B,0x5AD6B472,0x5A88F54C,
0xE029AC71,0xE019A5E6,0x47B0ACFD,0xED93FA9B,0xE8D3C48D,0x283B57CC,0xF8D56629,0x79132E28,
0x785F0191,0xED756055,0xF7960E44,0xE3D35E8C,0x15056DD4,0x88F46DBA,0x03A16125,0x0564F0BD,
0xC3EB9E15,0x3C9057A2,0x97271AEC,0xA93A072A,0x1B3F6D9B,0x1E6321F5,0xF59C66FB,0x26DCF319,
0x7533D928,0xB155FDF5,0x03563482,0x8ABA3CBB,0x28517711,0xC20AD9F8,0xABCC5167,0xCCAD925F,
0x4DE81751,0x3830DC8E,0x379D5862,0x9320F991,0xEA7A90C2,0xFB3E7BCE,0x5121CE64,0x774FBE32,
0xA8B6E37E,0xC3293D46,0x48DE5369,0x6413E680,0xA2AE0810,0xDD6DB224,0x69852DFD,0x09072166,
0xB39A460A,0x6445C0DD,0x586CDECF,0x1C20C8AE,0x5BBEF7DD,0x1B588D40,0xCCD2017F,0x6BB4E3BB,
0xDDA26A7E,0x3A59FF45,0x3E350A44,0xBCB4CDD5,0x72EACEA8,0xFA6484BB,0x8D6612AE,0xBF3C6F47,
0xD29BE463,0x542F5D9E,0xAEC2771B,0xF64E6370,0x740E0D8D,0xE75B1357,0xF8721671,0xAF537D5D,
0x4040CB08,0x4EB4E2CC,0x34D2466A,0x0115AF84,0xE1B00428,0x95983A1D,0x06B89FB4,0xCE6EA048,
0x6F3F3B82,0x3520AB82,0x011A1D4B,0x277227F8,0x611560B1,0xE7933FDC,0xBB3A792B,0x344525BD,
0xA08839E1,0x51CE794B,0x2F32C9B7,0xA01FBAC9,0xE01CC87E,0xBCC7D1F6,0xCF0111C3,0xA1E8AAC7,
0x1A908749,0xD44FBD9A,0xD0DADECB,0xD50ADA38,0x0339C32A,0xC6913667,0x8DF9317C,0xE0B12B4F,
0xF79E59B7,0x43F5BB3A,0xF2D519FF,0x27D9459C,0xBF97222C,0x15E6FC2A,0x0F91FC71,0x9B941525,
0xFAE59361,0xCEB69CEB,0xC2A86459,0x12BAA8D1,0xB6C1075E,0xE3056A0C,0x10D25065,0xCB03A442,
0xE0EC6E0E,0x1698DB3B,0x4C98A0BE,0x3278E964,0x9F1F9532,0xE0D392DF,0xD3A0342B,0x8971F21E,
0x1B0A7441,0x4BA3348C,0xC5BE7120,0xC37632D8,0xDF359F8D,0x9B992F2E,0xE60B6F47,0x0FE3F11D,
0xE54CDA54,0x1DAD4CE9,0xD4DBA84C,0x3E1B2E95,0x87AA31DC,0x27B5E6EA,0x0ABD8F46,0x17D0A83B,
0xC74B6A71,0x58DC9B2F,0x5AF3C578,0xEDFC7D23,0x7F979498,0xE9A6AB4A,0x83B58C71,0xE1D2B7EA,
0xC51AEBB0,0xA5D7A9B4,0xB4B5BBA0,0xD22B7C0E,0x2B6B4EA8,0x79BD2E44,0x4EA2AEA5,0x6D7218A1,
0x0E7EF66F,0x78CC00B6,0xDE5EB8AF,0x3D93BFBE,0xE9B60CE7,0x7CC870A4,0xD7EF8B04,0x5F18B5F6,
0x28BCDCD6,0x0BF23E97,0x1C1FBD0E,0x3CEC59B7,0x96432A0E,0x0406A42B,0xD7E5BC0E,0x77F60FA3,
0xA4E1E8B2,0x1D371A88,0x365C1AEB,0x87A9CB84,0xE0EDE4E8,0x0EF2DB2B,0x6CCC75EE,0x5573DD97,
0xEEB1A67C,0xDFD73D33,0xEB38E96A,0xDD09EE4A,0x02C91E2C,0x2D14CE8C,0x5E8B3AB7,0x23161CDB];

/* ─── Blowfish engine ─────────────────────────────────────────────────────── */
function bfEnc(lr,p,s0,s1,s2,s3){
    var l=lr[0],r=lr[1],t,f;
    for(var i=0;i<16;i++){
        l=(l^p[i])>>>0;
        f=(((s0[(l>>>24)&0xFF]+s1[(l>>>16)&0xFF])>>>0)^s2[(l>>>8)&0xFF])>>>0;
        f=(f+s3[l&0xFF])>>>0;
        r=(r^f)>>>0;
        t=l;l=r;r=t;
    }
    t=l;l=r;r=t;
    lr[0]=(r^p[16])>>>0; lr[1]=(l^p[17])>>>0;
}
function bfDec(lr,p,s0,s1,s2,s3){
    var l=lr[0],r=lr[1],t,f;
    for(var i=17;i>1;i--){
        l=(l^p[i])>>>0;
        f=(((s0[(l>>>24)&0xFF]+s1[(l>>>16)&0xFF])>>>0)^s2[(l>>>8)&0xFF])>>>0;
        f=(f+s3[l&0xFF])>>>0;
        r=(r^f)>>>0;
        t=l;l=r;r=t;
    }
    t=l;l=r;r=t;
    lr[0]=(r^p[1])>>>0; lr[1]=(l^p[0])>>>0;
}
function bfKey(keyStr){
    var kb=[],i,k,b;
    for(i=0;i<keyStr.length;i++) kb.push(keyStr.charCodeAt(i)&0xFF);
    var p=BFP.slice(),s0=BFS0.slice(),s1=BFS1.slice(),s2=BFS2.slice(),s3=BFS3.slice();
    var j=0;
    for(i=0;i<18;i++){var d=0;for(k=0;k<4;k++){d=((d<<8)|kb[j%kb.length])>>>0;j++;}p[i]=(p[i]^d)>>>0;}
    var lr=[0,0];
    for(i=0;i<18;i+=2){bfEnc(lr,p,s0,s1,s2,s3);p[i]=lr[0];p[i+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s0[b]=lr[0];s0[b+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s1[b]=lr[0];s1[b+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s2[b]=lr[0];s2[b+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s3[b]=lr[0];s3[b+1]=lr[1];}
    return {p:p,s0:s0,s1:s1,s2:s2,s3:s3};
}
function bfDecChunk(data,ctx){
    var out=new Uint8Array(data.length),ivL=0x00010203,ivR=0x04050607,lr=[0,0],off,cL,cR,pL,pR;
    for(off=0;off<data.length;off+=8){
        cL=(data[off]<<24|data[off+1]<<16|data[off+2]<<8|data[off+3])>>>0;
        cR=(data[off+4]<<24|data[off+5]<<16|data[off+6]<<8|data[off+7])>>>0;
        lr[0]=cL;lr[1]=cR;
        bfDec(lr,ctx.p,ctx.s0,ctx.s1,ctx.s2,ctx.s3);
        pL=(lr[0]^ivL)>>>0;pR=(lr[1]^ivR)>>>0;
        ivL=cL;ivR=cR;
        out[off]=(pL>>>24)&0xFF;out[off+1]=(pL>>>16)&0xFF;out[off+2]=(pL>>>8)&0xFF;out[off+3]=pL&0xFF;
        out[off+4]=(pR>>>24)&0xFF;out[off+5]=(pR>>>16)&0xFF;out[off+6]=(pR>>>8)&0xFF;out[off+7]=pR&0xFF;
    }
    return out;
}

/* ─── MD5 (little-endian) ────────────────────────────────────────────────── */
function md5hex(str){
    function R(n,c){return(n<<c)|(n>>>(32-c));}
    function a32(a,b){return(a+b)|0;}
    function ff(a,b,c,d,x,s,t){return a32(R(a32(a32(a,(b&c)|(~b&d)),a32(x,t)),s),b);}
    function gg(a,b,c,d,x,s,t){return a32(R(a32(a32(a,(b&d)|(c&~d)),a32(x,t)),s),b);}
    function hh(a,b,c,d,x,s,t){return a32(R(a32(a32(a,b^c^d),     a32(x,t)),s),b);}
    function ii(a,b,c,d,x,s,t){return a32(R(a32(a32(a,c^(b|~d)),  a32(x,t)),s),b);}
    var n=str.length,M=[],i;
    for(i=0;i<n;i++) M[i>>2]=(M[i>>2]||0)|(str.charCodeAt(i)&0xFF)<<((i%4)*8);
    M[n>>2]=(M[n>>2]||0)|(0x80<<((n%4)*8));
    M[(((n+8)>>6)<<4)+14]=n*8;
    var a=0x67452301,b=0xEFCDAB89,c=0x98BADCFE,d=0x10325476,aa,bb,cc,dd,X;
    for(i=0;i<M.length;i+=16){
        X=M.slice(i,i+16);while(X.length<16)X.push(0);
        aa=a;bb=b;cc=c;dd=d;
        a=ff(a,b,c,d,X[0], 7,-680876936); d=ff(d,a,b,c,X[1],12,-389564586); c=ff(c,d,a,b,X[2],17,606105819); b=ff(b,c,d,a,X[3],22,-1044525330);
        a=ff(a,b,c,d,X[4], 7,-176418897); d=ff(d,a,b,c,X[5],12,1200080426); c=ff(c,d,a,b,X[6],17,-1473231341);b=ff(b,c,d,a,X[7],22,-45705983);
        a=ff(a,b,c,d,X[8], 7,1770035416);d=ff(d,a,b,c,X[9],12,-1958414417);c=ff(c,d,a,b,X[10],17,-42063);b=ff(b,c,d,a,X[11],22,-1990404162);
        a=ff(a,b,c,d,X[12],7,1804603682);d=ff(d,a,b,c,X[13],12,-40341101);c=ff(c,d,a,b,X[14],17,-1502002290);b=ff(b,c,d,a,X[15],22,1236535329);
        a=gg(a,b,c,d,X[1], 5,-165796510); d=gg(d,a,b,c,X[6], 9,-1069501632);c=gg(c,d,a,b,X[11],14,643717713);b=gg(b,c,d,a,X[0],20,-373897302);
        a=gg(a,b,c,d,X[5], 5,-701558691); d=gg(d,a,b,c,X[10],9,38016083);c=gg(c,d,a,b,X[15],14,-660478335);b=gg(b,c,d,a,X[4],20,-405537848);
        a=gg(a,b,c,d,X[9], 5,568446438);d=gg(d,a,b,c,X[14],9,-1019803690);c=gg(c,d,a,b,X[3],14,-187363961);b=gg(b,c,d,a,X[8],20,1163531501);
        a=gg(a,b,c,d,X[13],5,-1444681467);d=gg(d,a,b,c,X[2],9,-51403784);c=gg(c,d,a,b,X[7],14,1735328473);b=gg(b,c,d,a,X[12],20,-1926607734);
        a=hh(a,b,c,d,X[5], 4,-378558);d=hh(d,a,b,c,X[8],11,-2022574463);c=hh(c,d,a,b,X[11],16,1839030562);b=hh(b,c,d,a,X[14],23,-35309556);
        a=hh(a,b,c,d,X[1], 4,-1530992060);d=hh(d,a,b,c,X[4],11,1272893353);c=hh(c,d,a,b,X[7],16,-155497632);b=hh(b,c,d,a,X[10],23,-1094730640);
        a=hh(a,b,c,d,X[13],4,681279174);d=hh(d,a,b,c,X[0],11,-358537222);c=hh(c,d,a,b,X[3],16,-722521979);b=hh(b,c,d,a,X[6],23,76029189);
        a=hh(a,b,c,d,X[9], 4,-640364487);d=hh(d,a,b,c,X[12],11,-421815835);c=hh(c,d,a,b,X[15],16,530742520);b=hh(b,c,d,a,X[2],23,-995338651);
        a=ii(a,b,c,d,X[0], 6,-198630844);d=ii(d,a,b,c,X[7],10,1126891415);c=ii(c,d,a,b,X[14],15,-1416354905);b=ii(b,c,d,a,X[5],21,-57434055);
        a=ii(a,b,c,d,X[12],6,1700485571);d=ii(d,a,b,c,X[3],10,-1894986606);c=ii(c,d,a,b,X[10],15,-1051523);b=ii(b,c,d,a,X[1],21,-2054922799);
        a=ii(a,b,c,d,X[8], 6,1873313359);d=ii(d,a,b,c,X[15],10,-30611744);c=ii(c,d,a,b,X[6],15,-1560198380);b=ii(b,c,d,a,X[13],21,1309151649);
        a=ii(a,b,c,d,X[4], 6,-145523070);d=ii(d,a,b,c,X[11],10,-1120210379);c=ii(c,d,a,b,X[2],15,718787259);b=ii(b,c,d,a,X[9],21,-343485551);
        a=a32(a,aa);b=a32(b,bb);c=a32(c,cc);d=a32(d,dd);
    }
    function le(n){var s='';for(var j=0;j<4;j++)s+=('0'+((n>>>(j*8))&0xFF).toString(16)).slice(-2);return s;}
    return le(a)+le(b)+le(c)+le(d);
}
function trackKey(id){
    var h=md5hex(String(id)),k='',i;
    for(i=0;i<16;i++) k+=String.fromCharCode(h.charCodeAt(i)^h.charCodeAt(i+16)^SECRET.charCodeAt(i));
    return k;
}

/* ─── Stream: decrypt → Blob URL (works without MSE) ─────────────────────── */
function streamDeezer(trackId, cdnUrl, audioEl, onErr) {
    var BLOCK = 2048;
    var ctx   = bfKey(trackKey(trackId));

    var xhr = new XMLHttpRequest();
    xhr.open('GET', cdnUrl, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 60000;

    xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
            if (onErr) onErr('CDN HTTP ' + xhr.status); return;
        }
        try {
            var raw = new Uint8Array(xhr.response);
            var out = new Uint8Array(raw.length);
            var bi  = 0;
            for (var off = 0; off < raw.length; off += BLOCK, bi++) {
                var end   = Math.min(off + BLOCK, raw.length);
                var chunk = raw.subarray(off, end);
                if (bi % 3 === 0 && chunk.length === BLOCK) out.set(bfDecChunk(chunk, ctx), off);
                else out.set(chunk, off);
            }
            // Create blob URL — works everywhere, no MSE needed
            var blob    = new Blob([out.buffer], { type: 'audio/mpeg' });
            var blobUrl = URL.createObjectURL(blob);
            // Revoke previous blob if any
            if (audioEl._dz_blob) { try { URL.revokeObjectURL(audioEl._dz_blob); } catch(e){} }
            audioEl._dz_blob = blobUrl;
            audioEl.src = blobUrl;
        } catch (e) {
            if (onErr) onErr('Decrypt error: ' + e.message);
        }
    };
    xhr.onerror   = function () { if (onErr) onErr('XHR network error'); };
    xhr.ontimeout = function () { if (onErr) onErr('XHR timeout'); };
    xhr.send();
}

/* ─── Network helpers ────────────────────────────────────────────────────── */
function apiGet(path,params,cb,err){
    var url=DEEZER+path+'?output=json';
    if(params)for(var k in params)url+='&'+k+'='+encodeURIComponent(params[k]);
    var x=new XMLHttpRequest(); x.open('GET',url,true); x.timeout=15000;
    x.onload=function(){try{cb(JSON.parse(x.responseText));}catch(e){if(err)err(e);}};
    x.onerror=x.ontimeout=function(e){if(err)err(e);}; x.send();
}
function getStreamUrl(id,cb,err){
    var x=new XMLHttpRequest(); x.open('POST',PROXY+'/get_url',true);
    x.setRequestHeader('Content-Type','application/json'); x.timeout=15000;
    x.onload=function(){
        try{
            var j=JSON.parse(x.responseText);
            var url=j.data&&j.data[0]&&j.data[0].media&&j.data[0].media[0]&&
                    j.data[0].media[0].sources&&j.data[0].media[0].sources[0]&&
                    j.data[0].media[0].sources[0].url;
            if(url)cb(url);else if(err)err('no url in response: '+x.responseText.slice(0,200));
        }catch(e){if(err)err(e);}
    };
    x.onerror=x.ontimeout=function(e){if(err)err(e);};
    x.send(JSON.stringify({formats:['MP3_128'],ids:[parseInt(id,10)]}));
}
function s2t(s){s=s|0;return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ─── Player ─────────────────────────────────────────────────────────────── */
var DZPlayer=(function(){
    var au=null,queue=[],qi=0;
    function getAu(){
        if(!au){au=document.createElement('audio');au.id='dz-au';au.style.display='none';document.body.appendChild(au);}
        return au;
    }
    function barEl(){return document.getElementById('dz-bar');}
    function initBar() {
        if (barEl()) return;
        var el = document.createElement('div'); el.id = 'dz-bar';
        el.innerHTML =
            '<div id="dz-prog-w"><div id="dz-prog"></div></div>' +
            '<div id="dz-cov"></div>' +
            '<div id="dz-info"><div id="dz-ttl"></div><div id="dz-art"></div></div>' +
            '<div id="dz-btns">' +
            '<button class="dz-b selector" id="dz-ctrl">⏸ Управление</button>' +
            '</div>';
        document.body.appendChild(el);
        // Clicking the control button opens a Select menu (works with remote)
        $(el).find('#dz-ctrl').on('click hover:enter', function () {
            var isPaused = au && au.paused;
            Lampa.Select.show({
                title: 'Deezer — плеер',
                items: [
                    { title: isPaused ? '▶ Продолжить' : '⏸ Пауза',  action: 'pp' },
                    { title: '⏮ Предыдущий трек',                    action: 'prev' },
                    { title: '⏭ Следующий трек',                     action: 'next' },
                    { title: '⏹ Остановить',                         action: 'stop' }
                ],
                onSelect: function (item) {
                    if (item.action === 'pp')   pub.toggle();
                    if (item.action === 'prev') pub.prev();
                    if (item.action === 'next') pub.next();
                    if (item.action === 'stop') pub.stop();
                },
                onBack: function () {}
            });
        });
    }
    function syncBar(t) {
        initBar();
        var bar = barEl();
        bar.style.display = 'flex';
        var tt = document.getElementById('dz-ttl'),
            at = document.getElementById('dz-art'),
            cv = document.getElementById('dz-cov');
        if (tt) tt.textContent = t.title || '';
        if (at) at.textContent = (t.artist && t.artist.name) || '';
        if (cv) cv.style.backgroundImage = (t.album && t.album.cover_small) ? 'url(' + t.album.cover_small + ')' : 'none';
        syncState();
    }
    function syncState() {
        var btn = document.getElementById('dz-ctrl');
        if (btn && au) btn.textContent = au.paused ? '▶ Управление' : '⏸ Управление';
    }
    function playTrack(t) {
        var el = getAu();
        el.pause();
        if (el._dz_blob) { try { URL.revokeObjectURL(el._dz_blob); } catch (e) {} el._dz_blob = null; }
        el.src = '';
        Lampa.Noty.show('\u{1F3B5} ' + (t.title || '...'));
        getStreamUrl(t.id, function (url) {
            el.oncanplay = function () {
                el.oncanplay = null;
                el.play().catch(function (e) { console.warn('[DZ play]', e); });
                syncBar(t); // show bar only when audio is actually ready
            };
            el.onerror = function () {
                Lampa.Noty.show('Deezer: ошибка аудио (код ' + (el.error && el.error.code) + ')');
                console.error('[DZ audio error]', el.error);
            };
            el.onended  = function () { pub.next(); };
            el.ontimeupdate = function () {
                var p = document.getElementById('dz-prog');
                if (p && el.duration) p.style.width = (el.currentTime / el.duration * 100) + '%';
            };
            streamDeezer(t.id, url, el, function (e) {
                Lampa.Noty.show('Deezer: ошибка загрузки трека');
                console.error('[DZ stream]', e);
            });
        }, function (e) {
            Lampa.Noty.show('Deezer: нет ссылки на трек');
            console.error('[DZ getUrl]', e);
        });
    }
    var pub={
        play:function(t,q,i){queue=q||[t];qi=(typeof i==='number')?i:0;playTrack(queue[qi]);},
        next:function(){if(qi<queue.length-1){qi++;playTrack(queue[qi]);}else pub.stop();},
        prev:function(){if(qi>0){qi--;playTrack(queue[qi]);}},
        toggle:function(){if(!au)return;au.paused?au.play():au.pause();syncState();},
        stop:function(){if(au){au.pause();au.src='';}var b=barEl();if(b)b.style.display='none';}
    };
    return pub;
}());

/* ─── CSS ────────────────────────────────────────────────────────────────── */
function injectCSS(){
    if(document.getElementById('dz-css'))return;
    var s=document.createElement('style');s.id='dz-css';
    s.textContent=
        '#dz-bar{position:fixed;bottom:0;left:0;right:0;z-index:10000;display:none;'+
        'flex-direction:row;align-items:center;gap:.8em;padding:.55em 1em;'+
        'background:rgba(16,16,16,.97);border-top:2px solid #c0392b;box-shadow:0 -3px 18px #000b;}'+
        '#dz-prog-w{position:absolute;bottom:0;left:0;right:0;height:2px;background:#2a2a2a;}'+
        '#dz-prog{height:100%;width:0;background:#c0392b;transition:width .4s linear;}'+
        '#dz-cov{width:3em;height:3em;border-radius:.3em;flex-shrink:0;background-size:cover;background-position:center;background-color:#222;}'+
        '#dz-info{flex:1;min-width:0;}'+
        '#dz-ttl{font-size:.92em;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        '#dz-art{font-size:.78em;color:#999;white-space:nowrap;}'+
        '#dz-btns{display:flex;gap:.35em;flex-shrink:0;}'+
        '.dz-b{background:#c0392b;border:none;color:#fff;padding:.32em .9em;border-radius:.25em;cursor:pointer;font-size:.88em;font-weight:600;}'+
        '.dz-b:focus,.dz-b.focused{background:#a93226;outline:none;}'+
        '.dz-view{padding:1em;color:#fff;padding-bottom:5em;}'+
        '.dz-hdr{display:flex;align-items:flex-start;gap:1em;margin-bottom:1.2em;}'+
        '.dz-hdr img{width:7em;height:7em;border-radius:.4em;object-fit:cover;flex-shrink:0;}'+
        '.dz-hdr-t{font-size:1.35em;font-weight:700;line-height:1.2;}'+
        '.dz-hdr-s{font-size:.85em;color:#999;margin-top:.2em;}'+
        '.dz-sec{font-size:.95em;font-weight:600;color:#ccc;padding:.6em 0 .28em;border-bottom:1px solid #282828;margin-bottom:.28em;}'+
        '.dz-row{display:flex;align-items:center;gap:.65em;padding:.4em .2em;border-bottom:1px solid #1c1c1c;cursor:pointer;border-radius:.2em;}'+
        '.dz-row:focus,.dz-row.focused{background:#1e1e1e;outline:none;}'+
        '.dz-rn{width:1.8em;text-align:right;color:#444;font-size:.82em;flex-shrink:0;}'+
        '.dz-ri{width:2.5em;height:2.5em;object-fit:cover;border-radius:.15em;flex-shrink:0;background:#1e1e1e;}'+
        '.dz-rinfo{flex:1;min-width:0;}'+
        '.dz-rt{font-size:.87em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        '.dz-ra{font-size:.74em;color:#777;white-space:nowrap;}'+
        '.dz-rd{font-size:.76em;color:#444;flex-shrink:0;}'+
        '.dz-cards{display:flex;gap:.8em;overflow-x:auto;padding:.4em 0 .75em;scrollbar-width:thin;scrollbar-color:#333 transparent;}'+
        '.dz-card{flex-shrink:0;width:9em;cursor:pointer;}'+
        '.dz-card img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:.35em;display:block;}'+
        '.dz-card:focus{outline:2px solid #c0392b;border-radius:.35em;}'+
        '.dz-cn{font-size:.8em;margin-top:.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        '.dz-cs{font-size:.7em;color:#777;white-space:nowrap;}'+
        '.dz-sbox{display:flex;gap:.55em;margin-bottom:1em;}'+
        '.dz-sinp{flex:1;background:#1a1a1a;border:1px solid #3a3a3a;color:#fff;padding:.45em .75em;border-radius:.3em;font-size:.9em;}'+
        '.dz-sinp:focus{border-color:#c0392b;outline:none;}'+
        '.dz-login-wrap{max-width:30em;margin:1.5em auto;}'+
        '.dz-login-row{display:flex;align-items:center;justify-content:space-between;'+
        'padding:.6em .8em;margin-bottom:.4em;background:#1a1a1a;border-radius:.35em;'+
        'border:1px solid #2a2a2a;cursor:pointer;}'+
        '.dz-login-row:focus,.dz-login-row.focused{border-color:#c0392b;outline:none;background:#1e1e1e;}'+
        '.dz-lr-label{color:#aaa;font-size:.9em;flex-shrink:0;margin-right:1em;}'+
        '.dz-lr-val{color:#fff;font-size:.9em;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:18em;}'+
        '.dz-login-btn{justify-content:center;background:#c0392b;border-color:#c0392b;font-weight:600;}'+
        '.dz-login-btn:focus,.dz-login-btn.focused{background:#a93226;border-color:#a93226;}';
    document.head.appendChild(s);
}

/* ─── UI helpers ─────────────────────────────────────────────────────────── */
function mkTracks(tracks, wrap, onPlay) {
    tracks.forEach(function (t, i) {
        var cov    = (t.album && t.album.cover_small) || '';
        var artist = (t.artist && t.artist.name) || '';
        var row    = document.createElement('div');
        row.className = 'dz-row selector';
        row.tabIndex  = 0;
        row.innerHTML =
            '<div class="dz-rn">' + (i + 1) + '</div>' +
            (cov ? '<img class="dz-ri" src="' + esc(cov) + '" alt="">' : '<div class="dz-ri"></div>') +
            '<div class="dz-rinfo"><div class="dz-rt">' + esc(t.title) + '</div>' +
            '<div class="dz-ra">' + esc(artist) + '</div></div>' +
            '<div class="dz-rd">' + s2t(t.duration || 0) + '</div>';
        var play = function () { onPlay(i); };
        row.addEventListener('click', play);
        $(row).on('hover:enter', play);
        wrap.appendChild(row);
    });
}
function mkCards(items, wrap, onClick) {
    var row = document.createElement('div');
    row.className = 'dz-cards';
    items.forEach(function (item) {
        var img  = item.picture_medium || item.cover_medium || '';
        var nm   = esc(item.title || item.name || '');
        var sub  = esc((item.artist && item.artist.name) || (item.nb_tracks ? item.nb_tracks + '\u00a0тр.' : ''));
        var c    = document.createElement('div');
        c.className = 'dz-card selector';
        c.tabIndex  = 0;
        c.innerHTML = '<img src="' + esc(img) + '" alt=""><div class="dz-cn">' + nm + '</div><div class="dz-cs">' + sub + '</div>';
        var go = function () { onClick(item); };
        c.addEventListener('click', go);
        $(c).on('hover:enter', go);
        row.appendChild(c);
    });
    wrap.appendChild(row);
}
function mkSec(txt){var d=document.createElement('div');d.className='dz-sec';d.textContent=txt;return d;}
function mkLoad(txt){var d=document.createElement('div');d.style.cssText='padding:1em;color:#666';d.textContent=txt||'Загрузка…';return d;}

/* ─── Private Deezer API using stored checkForm token ────────────────────── */
// After login we store checkForm in SKEY_TOKEN. Without it — playlists unavailable.
var SKEY_TOKEN = 'deezer_token';
var SKEY_UID   = 'deezer_uid';

function dzApi(method, params, cb, errCb) {
    var token = (Lampa.Storage.get(SKEY_TOKEN) || '').trim();
    if (!token) { if (errCb) errCb('No token — please re-login'); return; }
    gwCall(method, params, token, function (r) {
        if (cb) cb(r.results !== undefined ? r.results : r);
    }, errCb || function () {});
}

/* ─── Shared component base with Scroll + Controller navigation ──────────── */
function makeComp() {
    var scrl = new Lampa.Scroll({ mask: true, over: true });
    var html = $('<div class="dz-view"></div>');
    var last;
    scrl.append(html[0]);

    function bindNav() {
        var items = html.find('.selector');
        if (!items.length) return;
        // collectionSet needs the DOM element, pass the raw scroll container
        Lampa.Controller.collectionSet(scrl.render(true));
        Lampa.Controller.collectionFocus(last || items[0], scrl.render(true));
        items.off('hover:focus').on('hover:focus', function (e) {
            last = e.target;
            scrl.update($(e.target), true);
        });
    }

    // Register a 'content' controller so ActivitySlide.start() can toggle to us
    function registerController(comp) {
        Lampa.Controller.add('content', {
            link: comp,
            toggle: function () {
                bindNav();
            },
            up: function () {
                if (Navigator.canmove('up')) Navigator.move('up');
                else Lampa.Controller.toggle('head');
            },
            down: function () {
                if (Navigator.canmove('down')) Navigator.move('down');
            },
            left: function () {
                if (Navigator.canmove('left')) Navigator.move('left');
                else Lampa.Controller.toggle('menu');
            },
            right: function () {
                if (Navigator.canmove('right')) Navigator.move('right');
            },
            back: function () {
                Lampa.Activity.backward();
            }
        });
        Lampa.Controller.toggle('content');
    }

    return {
        scrl:               scrl,
        html:               html,
        bindNav:            bindNav,
        registerController: registerController,
        render:  function () { return scrl.render(); },
        destroy: function () { scrl.destroy(); html.remove(); }
    };
}

/* ─── Home component ─────────────────────────────────────────────────────── */
function HomeComp(object) {
    var c = makeComp();
    this.create = function () {
        var self = this, h = c.html[0];

        // Search row
        var $sb = $('<div class="dz-sbox">' +
            '<button class="dz-b selector" id="dz-search-open">🔍 Поиск</button>' +
            '</div>');
        $sb.find('#dz-search-open').on('hover:enter click', function () {
            Lampa.Input.edit({ title: 'Поиск в Deezer', value: '', nosave: true, free: true }, function (q) {
                q = q.trim();
                if (q) Lampa.Activity.push({ component: 'deezer_search', title: 'Поиск: ' + q, query: q });
            });
        });
        h.appendChild($sb[0]);

        var left = 3;
        function done() { if (--left <= 0) { self.activity.loader(false); self.activity.toggle(); c.bindNav(); } }

        // Account playlists if token saved (after email/password login)
        var token = (Lampa.Storage.get(SKEY_TOKEN) || '').trim();
        var uid   = (Lampa.Storage.get(SKEY_UID)   || '').trim();
        if (token && uid) {
            left++;
            dzApi('playlist.getList', { user_id: uid, nb: 50, start: 0 }, function (res) {
                var pls = (res && res.data) || [];
                if (pls.length) {
                    h.appendChild(mkSec('Мои плейлисты'));
                    mkCards(pls.map(function (p) {
                        return {
                            id:           p.PLAYLIST_ID || p.id,
                            title:        p.TITLE || p.title || 'Плейлист',
                            cover_medium: p.PICTURE_URL || '',
                            nb_tracks:    p.NB_SONG || p.nb_tracks || 0
                        };
                    }), h, function (pl) {
                        Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                    });
                }
                done();
            }, function () { done(); });
        }

        apiGet('/chart/0/tracks', { limit: 40 }, function (r) {
            var tr = (r.data || []).slice(0, 40);
            h.appendChild(mkSec('Топ треков'));
            mkTracks(tr, h, function (i) { DZPlayer.play(tr[i], tr, i); });
            done();
        }, function () { done(); });

        apiGet('/chart/0/albums', { limit: 16 }, function (r) {
            var al = (r.data || []).slice(0, 16);
            h.appendChild(mkSec('Топ альбомы'));
            mkCards(al, h, function (a) { Lampa.Activity.push({ component: 'deezer_album', title: a.title || 'Альбом', album: a }); });
            done();
        }, function () { done(); });

        apiGet('/chart/0/artists', { limit: 16 }, function (r) {
            var ar = (r.data || []).slice(0, 16);
            h.appendChild(mkSec('Топ артисты'));
            mkCards(ar, h, function (a) { Lampa.Activity.push({ component: 'deezer_artist', title: a.name || 'Артист', artist: a }); });
            done();
        }, function () { done(); });
    };
    this.start   = function () { c.registerController(this); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Search component ───────────────────────────────────────────────────── */
function SearchComp(object) {
    var c = makeComp();
    this.create = function () {
        var self = this, h = c.html[0];
        h.appendChild(mkLoad('Поиск «' + esc(object.query || '') + '»…'));
        apiGet('/search', { q: object.query || '', limit: 50 }, function (r) {
            var tr = (r.data || []).slice(0, 50);
            h.innerHTML = '';
            h.appendChild(mkSec('Результаты: «' + esc(object.query || '') + '»'));
            if (!tr.length) h.appendChild(mkLoad('Ничего не найдено'));
            else mkTracks(tr, h, function (i) { DZPlayer.play(tr[i], tr, i); });
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }, function () {
            h.innerHTML = '<div style="padding:1em;color:#e44">Ошибка поиска</div>';
            self.activity.loader(false); self.activity.toggle();
        });
    };
    this.start   = function () { c.registerController(this); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Album component ────────────────────────────────────────────────────── */
function AlbumComp(object) {
    var c = makeComp();
    this.create = function () {
        var self = this, h = c.html[0], album = object.album;
        h.appendChild(mkLoad());
        apiGet('/album/' + album.id, {}, function (r) {
            var tr = (r.tracks && r.tracks.data) || [];
            tr.forEach(function (t) {
                if (!t.album) t.album = { cover_small: album.cover_small, cover_medium: album.cover_medium };
                if (!t.artist && r.artist) t.artist = r.artist;
            });
            h.innerHTML = '';
            var hdr = document.createElement('div'); hdr.className = 'dz-hdr';
            hdr.innerHTML = '<img src="' + esc(album.cover_medium || '') + '" alt="">' +
                '<div><div class="dz-hdr-t">' + esc(r.title || album.title || '') + '</div>' +
                '<div class="dz-hdr-s">' + esc((r.artist && r.artist.name) || '') + '</div>' +
                '<div class="dz-hdr-s">' + esc(r.release_date || '') + (tr.length ? ' · ' + tr.length + ' тр.' : '') + '</div></div>';
            h.appendChild(hdr); h.appendChild(mkSec('Треки'));
            mkTracks(tr, h, function (i) { DZPlayer.play(tr[i], tr, i); });
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }, function () {
            h.innerHTML = '<div style="padding:1em;color:#e44">Ошибка загрузки</div>';
            self.activity.loader(false); self.activity.toggle();
        });
    };
    this.start   = function () { c.registerController(this); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Playlist component ─────────────────────────────────────────────────── */
function PlaylistComp(object) {
    var c = makeComp();
    this.create = function () {
        var self = this, h = c.html[0], pl = object.playlist;
        h.appendChild(mkLoad());
        apiGet('/playlist/' + pl.id, {}, function (r) {
            var tr = (r.tracks && r.tracks.data) || [];
            h.innerHTML = '';
            var hdr = document.createElement('div'); hdr.className = 'dz-hdr';
            hdr.innerHTML = '<img src="' + esc(r.picture_medium || pl.cover_medium || '') + '" alt="">' +
                '<div><div class="dz-hdr-t">' + esc(r.title || pl.title || '') + '</div>' +
                '<div class="dz-hdr-s">' + (r.nb_tracks || tr.length) + ' треков</div></div>';
            h.appendChild(hdr); h.appendChild(mkSec('Треки'));
            mkTracks(tr, h, function (i) { DZPlayer.play(tr[i], tr, i); });
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }, function () {
            h.innerHTML = '<div style="padding:1em;color:#e44">Ошибка загрузки плейлиста</div>';
            self.activity.loader(false); self.activity.toggle();
        });
    };
    this.start   = function () { c.registerController(this); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Artist component ───────────────────────────────────────────────────── */
function ArtistComp(object) {
    var c = makeComp();
    this.create = function () {
        var self = this, h = c.html[0], artist = object.artist;
        h.appendChild(mkLoad());
        var done = 0, tops = [], albs = [];
        function fin() {
            if (++done < 2) return;
            h.innerHTML = '';
            var hdr = document.createElement('div'); hdr.className = 'dz-hdr';
            hdr.innerHTML = '<img src="' + esc(artist.picture_medium || '') + '" alt="" style="border-radius:50%">' +
                '<div><div class="dz-hdr-t">' + esc(artist.name || '') + '</div></div>';
            h.appendChild(hdr);
            if (albs.length) { h.appendChild(mkSec('Альбомы')); mkCards(albs, h, function (a) { Lampa.Activity.push({ component: 'deezer_album', title: a.title || 'Альбом', album: a }); }); }
            if (tops.length) { h.appendChild(mkSec('Топ треки')); mkTracks(tops, h, function (i) { DZPlayer.play(tops[i], tops, i); }); }
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }
        apiGet('/artist/' + artist.id + '/top',    { limit: 50 }, function (r) { tops = (r.data || []).slice(0, 50); fin(); }, function () { fin(); });
        apiGet('/artist/' + artist.id + '/albums', { limit: 20 }, function (r) { albs = (r.data || []).slice(0, 20); fin(); }, function () { fin(); });
    };
    this.start   = function () { c.registerController(this); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Deezer auth via email+password ─────────────────────────────────────── */
// Uses gw-light.php (CORS-friendly) instead of connect.deezer.com (blocks CORS)
var DZ_APP_ID = '447462';
var DZ_SECRET = 'a83bf7f38ad2f137e444727cfc3775cf';

function gwCall(method, params, token, cb, errCb) {
    var url = 'https://www.deezer.com/ajax/gw-light.php?method=' + method +
              '&input=3&api_version=1.0&api_token=' + (token || 'null');
    var x = new XMLHttpRequest();
    x.open('POST', url, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.timeout = 15000;
    x.onload = function () {
        try { cb(JSON.parse(x.responseText)); }
        catch (e) { errCb('parse:' + e.message); }
    };
    x.onerror = x.ontimeout = function () { errCb('network'); };
    x.send(JSON.stringify(params || {}));
}

function deezerLogin(email, password, onSuccess, onFail) {
    // Step 1: get checkForm (api_token)
    gwCall('deezer.getUserData', {}, 'null', function (r1) {
        var token = r1.results && r1.results.checkForm;
        if (!token) { onFail('Нет checkForm, ответ: ' + JSON.stringify(r1).slice(0, 120)); return; }

        // Step 2: login — user.checkCredentials with md5 password
        gwCall('user.checkCredentials', {
            login:          email,
            password:       md5hex(password),
            checkFormLogin: token
        }, token, function (r2) {
            var err2 = r2.error;
            if (err2 && typeof err2 === 'object' && Object.keys(err2).length) {
                onFail('Неверный логин/пароль: ' + JSON.stringify(err2));
                return;
            }
            // Step 3: get ARL + save token for API calls
            gwCall('user.getArl', {}, token, function (r3) {
                var arl = r3.results;
                if (typeof arl === 'string' && arl.length > 20) {
                    // Also save checkForm token for private API calls
                    Lampa.Storage.set(SKEY_TOKEN, token);
                    // Save userId if available
                    var uid = r2.results && r2.results.USER && r2.results.USER.USER_ID;
                    if (uid) Lampa.Storage.set(SKEY_UID, String(uid));
                    onSuccess(arl);
                } else {
                    onFail('Нет ARL: ' + JSON.stringify(arl).slice(0, 80));
                }
            }, onFail);
        }, onFail);
    }, onFail);
}

/* ─── Login component (all inputs via Lampa.Input) ───────────────────────── */
function LoginComp(object) {
    var c = makeComp();
    // store password in memory only, never trim
    var _pass = '';

    this.create = function () {
        var h = c.html[0];
        var arl = (Lampa.Storage.get(SKEY) || '').trim();
        if (arl) {
            // Already logged in — redirect
            setTimeout(function () {
                Lampa.Activity.replace({ component: 'deezer_home', title: 'Deezer' });
            }, 50);
            return;
        }

        function renderLogin() {
            var email = Lampa.Storage.get('deezer_email', '') || '';
            h.innerHTML = '';

            function row(label, val, onClick) {
                var d = document.createElement('div');
                d.className = 'dz-login-row selector';
                d.tabIndex = 0;
                d.innerHTML = '<span class="dz-lr-label">' + label + '</span>' +
                              '<span class="dz-lr-val">' + esc(val) + '</span>';
                d.addEventListener('click', onClick);
                d.addEventListener('keydown', function(e){ if(e.key==='Enter') onClick(); });
                $(d).on('hover:enter', onClick);
                return d;
            }

            var emailRow = row('Email', email || '(нажмите для ввода)', function () {
                Lampa.Input.edit({ title: 'Email Deezer', value: Lampa.Storage.get('deezer_email', ''), nosave: true, free: true }, function (v) {
                    Lampa.Storage.set('deezer_email', v);
                    emailRow.querySelector('.dz-lr-val').textContent = v || '(нажмите для ввода)';
                });
            });

            var passRow = row('Пароль', _pass ? '••••••' : '(нажмите для ввода)', function () {
                Lampa.Input.edit({ title: 'Пароль Deezer', value: '', nosave: true, free: true }, function (v) {
                    // DO NOT trim password — spaces are valid
                    _pass = v;
                    passRow.querySelector('.dz-lr-val').textContent = _pass ? '•'.repeat(Math.min(_pass.length, 10)) : '(нажмите для ввода)';
                });
            });

            var loginBtn = document.createElement('div');
            loginBtn.className = 'dz-login-row dz-login-btn selector';
            loginBtn.tabIndex = 0;
            loginBtn.innerHTML = '▶ Войти';
            var doLogin = function () {
                var em = (Lampa.Storage.get('deezer_email', '') || '').trim();
                if (!em || !_pass) { Lampa.Noty.show('Введи email и пароль'); return; }
                loginBtn.textContent = 'Вход…';
                deezerLogin(em, _pass, function (arl) {
                    Lampa.Storage.set(SKEY, arl);
                    _pass = '';
                    Lampa.Noty.show('Deezer: вход выполнен ✓');
                    Lampa.Activity.replace({ component: 'deezer_home', title: 'Deezer' });
                }, function (err) {
                    loginBtn.textContent = '▶ Войти';
                    Lampa.Noty.show('Ошибка входа: ' + err);
                    console.error('[DZ login]', err);
                });
            };
            loginBtn.addEventListener('click', doLogin);
            loginBtn.addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
            $(loginBtn).on('hover:enter', doLogin);

            var sep = document.createElement('div');
            sep.className = 'dz-sec';
            sep.style.margin = '.8em 0 .4em';
            sep.textContent = '— или ARL-токен вручную —';

            var arlRow = row('ARL-токен', '(нажмите для ввода)', function () {
                Lampa.Input.edit({ title: 'ARL-токен Deezer', value: Lampa.Storage.get(SKEY, ''), nosave: true, free: true }, function (v) {
                    v = v.trim();
                    if (v) {
                        Lampa.Storage.set(SKEY, v);
                        Lampa.Noty.show('ARL сохранён');
                        Lampa.Activity.replace({ component: 'deezer_home', title: 'Deezer' });
                    }
                });
            });

            h.appendChild(emailRow);
            h.appendChild(passRow);
            h.appendChild(loginBtn);
            h.appendChild(sep);
            h.appendChild(arlRow);
            c.bindNav();
        }

        renderLogin();
    };
    this.start   = function () { c.registerController(this); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { _pass = ''; c.destroy(); };
}

/* ─── Bootstrap ──────────────────────────────────────────────────────────── */
function startPlugin(){
    injectCSS();

    // Register components
    Lampa.Component.add('deezer_login',    LoginComp);
    Lampa.Component.add('deezer_home',     HomeComp);
    Lampa.Component.add('deezer_search',   SearchComp);
    Lampa.Component.add('deezer_album',    AlbumComp);
    Lampa.Component.add('deezer_playlist', PlaylistComp);
    Lampa.Component.add('deezer_artist',   ArtistComp);

    // Register settings section — wrap in try/catch to diagnose crashes
    try {
        // Must register all 'input' type fields in Params to avoid update() crash
        Lampa.Params.select(SKEY,          '', '');
        Lampa.Params.select('deezer_email', '', '');
        Lampa.Params.select('deezer_pass',  '', '');

        Lampa.SettingsApi.addComponent({
            component: 'deezer',
            name:      'Deezer',
            icon:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>'
        });

        // Email — type:'static' + manual Input.edit, no Params.update() involvement
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_email', type:'static'},
            field: {name:'Email Deezer'},
            onRender: function(item){
                var cur = Lampa.Storage.get('deezer_email','');
                if(cur) item.find('.settings-param__name').text('Email: '+cur);
                item.on('hover:enter', function(){
                    Lampa.Input.edit({
                        title: 'Email Deezer', value: Lampa.Storage.get('deezer_email',''),
                        nosave: true, free: true
                    }, function(v){
                        v = v.trim();
                        Lampa.Storage.set('deezer_email', v);
                        item.find('.settings-param__name').text(v ? 'Email: '+v : 'Email Deezer');
                    });
                });
            }
        });

        // Password — type:'static'
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_pass', type:'static'},
            field: {name:'Пароль Deezer'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    Lampa.Input.edit({
                        title: 'Пароль Deezer', value: '',
                        nosave: true, free: true, password: true
                    }, function(v){
                        v = v.trim();
                        Lampa.Storage.set('deezer_pass', v);
                        item.find('.settings-param__name').text(v ? 'Пароль: ••••••' : 'Пароль Deezer');
                    });
                });
            }
        });

        // Login button
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_do_login', type:'static'},
            field: {name:'▶ Войти через email + пароль'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    var email=(Lampa.Storage.get('deezer_email','')||'').trim();
                    var pass =(Lampa.Storage.get('deezer_pass', '')||'').trim();
                    if(!email||!pass){ Lampa.Noty.show('Заполни Email и Пароль'); return; }
                    item.find('.settings-param__name').text('Вход...');
                    deezerLogin(email, pass, function(arl){
                        Lampa.Storage.set(SKEY, arl);
                        Lampa.Storage.set('deezer_pass', '');
                        item.find('.settings-param__name').text('▶ Войти через email + пароль');
                        Lampa.Noty.show('Deezer: вход выполнен ✓');
                    }, function(err){
                        item.find('.settings-param__name').text('▶ Войти через email + пароль');
                        Lampa.Noty.show('Ошибка: '+err);
                    });
                });
            }
        });

        // ARL manual
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_sep', type:'title'},
            field: {name:'— или ARL-токен вручную —'}
        });
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_arl_btn', type:'static'},
            field: {name:'Вставить ARL-токен'},
            onRender: function(item){
                var cur = Lampa.Storage.get(SKEY,'');
                if(cur) item.find('.settings-param__name').text('ARL: '+cur.slice(0,10)+'...');
                item.on('hover:enter', function(){
                    Lampa.Input.edit({
                        title: 'ARL-токен Deezer', value: Lampa.Storage.get(SKEY,''),
                        nosave: true, free: true
                    }, function(v){
                        v = v.trim();
                        if(v){ Lampa.Storage.set(SKEY, v); Lampa.Noty.show('ARL сохранён'); }
                        item.find('.settings-param__name').text(v ? 'ARL: '+v.slice(0,10)+'...' : 'Вставить ARL-токен');
                    });
                });
            }
        });

        // Open / Logout
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_open', type:'static'},
            field: {name:'Открыть Deezer'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    Lampa.Controller.toggle('content');
                    Lampa.Activity.push({component: Lampa.Storage.get(SKEY,'') ? 'deezer_home' : 'deezer_login', title:'Deezer'});
                });
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_logout', type:'static'},
            field: {name:'Выйти из Deezer'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    Lampa.Storage.set(SKEY,''); Lampa.Storage.set('deezer_email',''); Lampa.Storage.set('deezer_pass','');
                    Lampa.Noty.show('Deezer: выход выполнен');
                    item.find('.settings-param__name').text('Выйти из Deezer');
                });
            }
        });
    } catch(e) {
        console.error('[Deezer] Settings registration error:', e.message, e.stack);
    }

    // Add menu button
    Lampa.Listener.follow('menu',function(e){
        if(e.type !== 'start') return;
        var icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
        Lampa.Menu.addButton(icon, 'Deezer', function(){
            var arl=(Lampa.Storage.get(SKEY)||'').trim();
            Lampa.Activity.push({component: arl?'deezer_home':'deezer_login', title:'Deezer'});
        });
    });

    console.log('[Deezer plugin] ready');
}

// Wait for Lampa to fully initialize
if(window.Lampa&&Lampa.Listener&&Lampa.Component&&Lampa.SettingsApi){
    startPlugin();
}else{
    var _dz=setInterval(function(){
        if(window.Lampa&&Lampa.Listener&&Lampa.Component&&Lampa.SettingsApi){
            clearInterval(_dz);startPlugin();
        }
    },100);
}

}()); // end IIFE